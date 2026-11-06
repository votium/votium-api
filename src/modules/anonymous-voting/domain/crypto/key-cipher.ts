import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// AES-256-GCM for election private keys at rest. Format: base64(iv || tag || ciphertext).
// A fresh 96-bit IV is drawn for every call. The key is passed in: this module never reads
// configuration or files.
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

function assertKey(key: Uint8Array): void {
  if (key.length !== KEY_BYTES) {
    throw new Error('election key encryption key must be 32 bytes');
  }
}

export function encryptKey(plain: Uint8Array, key: Uint8Array): string {
  assertKey(key);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

export function decryptKey(encoded: string, key: Uint8Array): Uint8Array {
  assertKey(key);
  const data = Buffer.from(encoded, 'base64');
  if (data.length < IV_BYTES + TAG_BYTES) {
    throw new Error('encrypted key is truncated');
  }
  const decipher = createDecipheriv(ALGORITHM, key, data.subarray(0, IV_BYTES));
  decipher.setAuthTag(data.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
  // GCM authentication failure throws here: a wrong key or a tampered ciphertext never decrypts.
  return new Uint8Array(
    Buffer.concat([decipher.update(data.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]),
  );
}
