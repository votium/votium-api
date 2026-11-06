// Encrypts and decrypts election private keys before they reach persistence. The adapter that
// holds the actual key lives in infrastructure; the application layer only sees this port.
export const KEY_PROTECTION_PORT = 'KeyProtectionPort';

export interface KeyProtectionPort {
  encrypt(plain: Uint8Array): string;
  decrypt(encoded: string): Uint8Array;
}
