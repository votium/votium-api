// ESM-only library (@noble/curves): runs in the integration project.
import {
  SchnorrRistrettoZkp,
  scalarToHex,
  type SchnorrProof,
} from '../../../src/modules/anonymous-voting/domain/crypto/schnorr-zkp';
import vectors from './vectors/schnorr.json';

const T = {
  electionId: 'election-1',
  ballotId: '5b1e8a3c-6f2d-4c1a-9b7e-0d3f2a1c9e10',
  candidacyId: 'cand-1',
};
const X = scalarToHex(123456789n);

describe('Schnorr proof over Ristretto255', () => {
  const zkp = new SchnorrRistrettoZkp();

  it('accepts a proof for its own transcript', async () => {
    expect(await zkp.verify(await zkp.prove(X, T), T)).toBe(true);
  });

  it('rejects a proof replayed for another ballot', async () => {
    const p = await zkp.prove(X, T);
    expect(await zkp.verify(p, { ...T, ballotId: '00000000-0000-4000-8000-000000000000' })).toBe(
      false,
    );
  });

  it('rejects a proof replayed for another candidacy', async () => {
    const p = await zkp.prove(X, T);
    expect(await zkp.verify(p, { ...T, candidacyId: 'cand-2' })).toBe(false);
  });

  it('recomputes c: a forged c is rejected even if it matches s and t', async () => {
    const p = await zkp.prove(X, T);
    expect(await zkp.verify({ ...p, c: scalarToHex(42n) }, T)).toBe(false);
  });

  it('rejects an altered response s', async () => {
    const p = await zkp.prove(X, T);
    const altered: SchnorrProof = { ...p, s: scalarToHex(BigInt(`0x${p.s}`) + 1n) };
    expect(await zkp.verify(altered, T)).toBe(false);
  });

  it('rejects a proof whose y belongs to another secret', async () => {
    const p = await zkp.prove(X, T);
    const other = await zkp.prove(scalarToHex(987654321n), T);
    expect(await zkp.verify({ ...p, y: other.y }, T)).toBe(false);
  });

  it('rejects non-canonical scalars (>= group order)', async () => {
    const p = await zkp.prove(X, T);
    expect(await zkp.verify({ ...p, s: 'f'.repeat(64) }, T)).toBe(false);
    expect(await zkp.verify({ ...p, c: 'f'.repeat(64) }, T)).toBe(false);
  });

  it('rejects malformed hex and points that are not on the group', async () => {
    const p = await zkp.prove(X, T);
    expect(await zkp.verify({ ...p, t: 'zz' }, T)).toBe(false);
    expect(await zkp.verify({ ...p, y: 'ff'.repeat(32) }, T)).toBe(false);
  });

  it('refuses to prove with a zero or non-canonical secret', async () => {
    await expect(zkp.prove('0'.repeat(64), T)).rejects.toThrow('invalid secret');
  });

  // Regression vectors shared with votium-web (test vectors file). Deterministic nonce.
  it.each(vectors.cases)('reproduces the shared vector $name', async (v) => {
    const p = await zkp.proveWithNonce(v.secret, v.transcript, v.nonce);
    expect(p).toEqual(v.expected);
    expect(await zkp.verify(p, v.transcript)).toBe(true);
  });
});
