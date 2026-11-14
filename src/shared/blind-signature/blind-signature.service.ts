// shared/blind-signature/blind-signature.service.ts
import { Injectable } from '@nestjs/common';
import { RSABSSA } from '@cloudflare/blindrsa-ts';
import { ElectionKeyService } from './election-key.service';

const suite = RSABSSA.SHA384.PSS.Deterministic();
const subtle = globalThis.crypto.subtle;
const ALG = { name: 'RSA-PSS', hash: 'SHA-384' };
const der = (pem: string) => Buffer.from(pem.replace(/-----[^-]+-----|\s/g, ''), 'base64');

/** Única definición del mensaje firmado. Debe coincidir con U.tokenMessage del chaincode. */
export const voteMessage = (electionId: string, nullifier: string) =>
  new TextEncoder().encode(`votium|v1|${electionId}|${nullifier}`);

@Injectable()
export class BlindSignatureService {
  private priv = new Map<string, CryptoKey>();
  private pub = new Map<string, CryptoKey>();
  constructor(private keys: ElectionKeyService) {}

  async signBlinded(electionId: string, blindedB64: string): Promise<string> {
    let k = this.priv.get(electionId);
    if (!k) {
      const { privateKeyPem } = await this.keys.loadKeyPair(electionId);
      k = await subtle.importKey('pkcs8', der(privateKeyPem), ALG, false, ['sign']);
      this.priv.set(electionId, k);
    }
    const sig = await suite.blindSign(k, Buffer.from(blindedB64, 'base64'));
    return Buffer.from(sig).toString('base64');
  }

  /** Pre-chequeo barato: el chaincode sigue siendo quien decide. */
  async verify(
    electionId: string,
    publicKeyPem: string,
    nullifier: string,
    sigB64: string,
  ): Promise<boolean> {
    try {
      let k = this.pub.get(electionId);
      if (!k) {
        k = await subtle.importKey('spki', der(publicKeyPem), ALG, true, ['verify']);
        this.pub.set(electionId, k);
      }
      return await suite.verify(
        k,
        Buffer.from(sigB64, 'base64'),
        voteMessage(electionId, nullifier),
      );
    } catch {
      return false;
    }
  }

  evict(electionId: string) {
    this.priv.delete(electionId);
    this.pub.delete(electionId);
  }
}
