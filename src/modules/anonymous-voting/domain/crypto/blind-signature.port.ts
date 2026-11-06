export const BLIND_SIGNATURE_PORT = 'BlindSignaturePort';

export interface ElectionKeyPair {
  // SPKI (DER). Public, served to clients.
  publicKeySpki: Uint8Array;
  // PKCS#8 (DER). Secret. Must be encrypted at rest and never returned or logged.
  privateKeyPkcs8: Uint8Array;
}

export interface BlindSignaturePort {
  generateKeyPair(): Promise<ElectionKeyPair>;
  // Throws BlindedMessageOutOfRangeError when the input is not an element of the RSA group.
  blindSign(privateKeyPkcs8: Uint8Array, blindedMessage: Uint8Array): Promise<Uint8Array>;
  verify(publicKeySpki: Uint8Array, message: Uint8Array, signature: Uint8Array): Promise<boolean>;
}
