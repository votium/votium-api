import { randomBytes } from 'crypto';
import { decryptKey, encryptKey } from './key-cipher';

describe('key-cipher (AES-256-GCM at rest)', () => {
  const key = randomBytes(32);
  const plain = Uint8Array.from(randomBytes(120));

  it('round-trips a private key', () => {
    const enc = encryptKey(plain, key);
    expect(Buffer.from(decryptKey(enc, key))).toEqual(Buffer.from(plain));
  });

  it('uses a fresh IV, so two encryptions of the same bytes differ', () => {
    expect(encryptKey(plain, key)).not.toBe(encryptKey(plain, key));
  });

  it('stores iv || tag || ciphertext in base64 (12 + 16 + len bytes)', () => {
    const raw = Buffer.from(encryptKey(plain, key), 'base64');
    expect(raw).toHaveLength(12 + 16 + plain.length);
  });

  it('rejects a tampered ciphertext', () => {
    const raw = Buffer.from(encryptKey(plain, key), 'base64');
    raw[raw.length - 1] ^= 0x01;
    expect(() => decryptKey(raw.toString('base64'), key)).toThrow();
  });

  it('rejects decryption with another key', () => {
    expect(() => decryptKey(encryptKey(plain, key), randomBytes(32))).toThrow();
  });

  it('refuses a key that is not 32 bytes', () => {
    expect(() => encryptKey(plain, randomBytes(16))).toThrow('32 bytes');
    expect(() => decryptKey(encryptKey(plain, key), randomBytes(16))).toThrow('32 bytes');
  });
});
