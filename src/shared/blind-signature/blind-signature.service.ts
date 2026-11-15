// shared/blind-signature/blind-signature.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { RSABSSA } from '@cloudflare/blindrsa-ts';
import { ElectionKeyService } from './election-key.service';
import { constants, createPublicKey, KeyObject, verify as nodeVerify } from 'node:crypto';

const suite = RSABSSA.SHA384.PSS.Deterministic();
const subtle = globalThis.crypto.subtle;
const ALG = { name: 'RSA-PSS', hash: 'SHA-384' };
const der = (pem: string) =>
  new Uint8Array(Buffer.from(pem.replace(/-----[^-]+-----|\s/g, ''), 'base64'));

/** Única definición del mensaje firmado. Debe coincidir con U.tokenMessage del chaincode. */
export const voteMessage = (electionId: string, nullifier: string) =>
  new TextEncoder().encode(`votium|v1|${electionId}|${nullifier}`);

@Injectable()
export class BlindSignatureService {
  private log = new Logger(BlindSignatureService.name);
  private priv = new Map<string, CryptoKey>();
  private pub = new Map<string, CryptoKey>();
  constructor(private keys: ElectionKeyService) {}

  async signBlinded(electionId: string, blindedB64: string): Promise<string> {
    let k = this.priv.get(electionId);
    if (!k) {
      const { privateKeyPem } = await this.keys.loadKeyPair(electionId);
      k = await subtle.importKey('pkcs8', der(privateKeyPem), ALG, true, ['sign']);
      this.priv.set(electionId, k);
    }
    const blinded = Buffer.from(blindedB64, 'base64');
    this.log.debug(
      `blinded=${blinded.length} bytes, modulus=${(k.algorithm as any).modulusLength / 8} bytes`,
    );
    const sig = await suite.blindSign(k, blinded);
    return Buffer.from(sig).toString('base64');
  }

  /** Pre-chequeo barato: el chaincode sigue siendo quien decide. */
  private pubKeys = new Map<string, KeyObject>();

  verify(electionId: string, publicKeyPem: string, nullifier: string, sigB64: string): boolean {
    try {
      const sig = Buffer.from(sigB64, 'base64');
      if (!sig.length) return false;

      let key = this.pubKeys.get(electionId);
      if (!key) {
        key = createPublicKey(publicKeyPem);
        this.pubKeys.set(electionId, key);
      }
      return nodeVerify(
        'sha384',
        Buffer.from(voteMessage(electionId, nullifier)),
        { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: 48 }, // igual que el chaincode
        sig,
      );
    } catch (e: any) {
      this.log.error(`verify lanzó: ${e?.message}`);
      return false;
    }
  }

  evict(electionId: string) {
    this.priv.delete(electionId);
    this.pub.delete(electionId);
  }
}
