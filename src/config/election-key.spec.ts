import { randomBytes } from 'crypto';
import { decodeElectionKeyEncryptionKey } from './envs';

describe('decodeElectionKeyEncryptionKey', () => {
  it('accepts 32 random bytes in base64, with or without a trailing newline', () => {
    const encoded = randomBytes(32).toString('base64');
    expect(decodeElectionKeyEncryptionKey(encoded)).toHaveLength(32);
    expect(decodeElectionKeyEncryptionKey(`${encoded}\n`)).toHaveLength(32);
  });

  it('rejects keys that decode to a length other than 32 bytes', () => {
    expect(() => decodeElectionKeyEncryptionKey(randomBytes(16).toString('base64'))).toThrow(
      'must decode to 32 bytes',
    );
    expect(() => decodeElectionKeyEncryptionKey(randomBytes(33).toString('base64'))).toThrow(
      'must decode to 32 bytes',
    );
  });

  it('rejects content that is not base64', () => {
    expect(() => decodeElectionKeyEncryptionKey('not base64 at all!')).toThrow('not valid base64');
    expect(() => decodeElectionKeyEncryptionKey('')).toThrow('not valid base64');
  });
});
