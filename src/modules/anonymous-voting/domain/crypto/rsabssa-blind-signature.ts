import type { RSABSSA } from '@cloudflare/blindrsa-ts';
import { BlindedMessageOutOfRangeError } from '../errors/blinded-message-out-of-range.error';
import type { BlindSignaturePort, ElectionKeyPair } from './blind-signature.port';

const MODULUS_BITS = 2048;
const PUBLIC_EXPONENT = Uint8Array.from([1, 0, 1]);
const RSA_PSS = { name: 'RSA-PSS', hash: 'SHA-384' } as const;

type Suite = ReturnType<typeof RSABSSA.SHA384.PSS.Deterministic>;

// @cloudflare/blindrsa-ts is ESM-only: loaded with a dynamic import, cached once.
let suitePromise: Promise<Suite> | undefined;
export function loadBlindRsaSuite(): Promise<Suite> {
  // RFC 9474 RSABSSA-SHA384-PSS-Deterministic. The signed message already carries a fresh random
  // ballotId, so no prefix has to travel with the vote.
  suitePromise ??= import('@cloudflare/blindrsa-ts').then((lib) =>
    lib.RSABSSA.SHA384.PSS.Deterministic(),
  );
  return suitePromise;
}

// WebCrypto requires ArrayBuffer-backed views.
const buf = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(bytes);

export class RsaBssaBlindSignature implements BlindSignaturePort {
  async generateKeyPair(): Promise<ElectionKeyPair> {
    const suite = await loadBlindRsaSuite();
    const { publicKey, privateKey } = await suite.generateKey({
      publicExponent: PUBLIC_EXPONENT,
      modulusLength: MODULUS_BITS,
    });
    return {
      publicKeySpki: new Uint8Array(await crypto.subtle.exportKey('spki', publicKey)),
      privateKeyPkcs8: new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey)),
    };
  }

  async blindSign(privateKeyPkcs8: Uint8Array, blindedMessage: Uint8Array): Promise<Uint8Array> {
    const suite = await loadBlindRsaSuite();
    const key = await crypto.subtle.importKey('pkcs8', buf(privateKeyPkcs8), RSA_PSS, true, [
      'sign',
    ]);
    try {
      return new Uint8Array(await suite.blindSign(key, blindedMessage));
    } catch {
      throw new BlindedMessageOutOfRangeError();
    }
  }

  async verify(
    publicKeySpki: Uint8Array,
    message: Uint8Array,
    signature: Uint8Array,
  ): Promise<boolean> {
    const suite = await loadBlindRsaSuite();
    const key = await crypto.subtle.importKey('spki', buf(publicKeySpki), RSA_PSS, true, [
      'verify',
    ]);
    return suite.verify(key, signature, message);
  }
}
