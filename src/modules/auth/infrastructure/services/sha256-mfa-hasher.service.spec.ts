import { Sha256MfaHasherService } from './sha256-mfa-hasher.service';

const KNOWN_CODE = '123456';
const KNOWN_DIGEST = '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92';

describe('Sha256MfaHasherService', () => {
  const service = new Sha256MfaHasherService();

  it('produces a 64-character lowercase hex digest', async () => {
    const hashed = await service.hash(KNOWN_CODE);
    expect(hashed).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches the documented SHA-256 vector', async () => {
    await expect(service.hash(KNOWN_CODE)).resolves.toBe(KNOWN_DIGEST);
  });

  it('is deterministic for the same input', async () => {
    const first = await service.hash(KNOWN_CODE);
    const second = await service.hash(KNOWN_CODE);
    expect(first).toBe(second);
  });

  it('verifies a correct code', async () => {
    const hashed = await service.hash(KNOWN_CODE);
    await expect(service.verify(KNOWN_CODE, hashed)).resolves.toBe(true);
  });

  it('rejects an incorrect code', async () => {
    const hashed = await service.hash(KNOWN_CODE);
    await expect(service.verify('654321', hashed)).resolves.toBe(false);
  });

  it('accepts an uppercase hex digest', async () => {
    const hashed = (await service.hash(KNOWN_CODE)).toUpperCase();
    await expect(service.verify(KNOWN_CODE, hashed)).resolves.toBe(true);
  });

  it('returns false without throwing when the stored hash has an invalid length', async () => {
    await expect(service.verify(KNOWN_CODE, 'abc123')).resolves.toBe(false);
  });

  it('returns false without throwing when the stored hash is not hex', async () => {
    await expect(service.verify(KNOWN_CODE, 'z'.repeat(64))).resolves.toBe(false);
  });

  it('never embeds the raw code into its digest', async () => {
    const hashed = await service.hash('secret-code-42');
    expect(hashed).not.toContain('secret-code-42');
  });
});
