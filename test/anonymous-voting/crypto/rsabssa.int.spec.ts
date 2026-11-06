// ESM-only libraries: runs in the integration project (npm run test:integration).
import { buildBallotMessage } from '../../../src/modules/anonymous-voting/domain/crypto/ballot-message';
import {
  RsaBssaBlindSignature,
  loadBlindRsaSuite,
} from '../../../src/modules/anonymous-voting/domain/crypto/rsabssa-blind-signature';
import { BlindedMessageOutOfRangeError } from '../../../src/modules/anonymous-voting/domain/errors/blinded-message-out-of-range.error';

describe('RSABSSA blind signature (RFC 9474)', () => {
  const signer = new RsaBssaBlindSignature();
  let suite: Awaited<ReturnType<typeof loadBlindRsaSuite>>;
  let keys: Awaited<ReturnType<RsaBssaBlindSignature['generateKeyPair']>>;

  beforeAll(async () => {
    suite = await loadBlindRsaSuite();
    keys = await signer.generateKeyPair();
  });

  async function client(message: Uint8Array) {
    const pub = await crypto.subtle.importKey(
      'spki',
      new Uint8Array(keys.publicKeySpki),
      { name: 'RSA-PSS', hash: 'SHA-384' },
      true,
      ['verify'],
    );
    const prepared = suite.prepare(message);
    const { blindedMsg, inv } = await suite.blind(pub, prepared);
    return {
      blindedMsg,
      finalize: (blindSig: Uint8Array) => suite.finalize(pub, prepared, blindSig, inv),
    };
  }

  it('2048-bit key: 256-byte modulus and 256-byte signatures', () => {
    expect(keys.publicKeySpki.length).toBeGreaterThan(280);
  });

  it('round trip: blind, sign, unblind and verify the ballot message', async () => {
    const msg = buildBallotMessage('election-1', '5b1e8a3c-6f2d-4c1a-9b7e-0d3f2a1c9e10');
    const c = await client(msg);
    const sig = await c.finalize(await signer.blindSign(keys.privateKeyPkcs8, c.blindedMsg));
    expect(await signer.verify(keys.publicKeySpki, msg, sig)).toBe(true);
  });

  it('rejects the signature over a different ballot', async () => {
    const msg = buildBallotMessage('election-1', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    const c = await client(msg);
    const sig = await c.finalize(await signer.blindSign(keys.privateKeyPkcs8, c.blindedMsg));
    expect(
      await signer.verify(
        keys.publicKeySpki,
        buildBallotMessage('election-1', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
        sig,
      ),
    ).toBe(false);
  });

  it('rejects the signature of another election key', async () => {
    const msg = buildBallotMessage('election-1', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    const other = await signer.generateKeyPair();
    const c = await client(msg);
    const sig = await c.finalize(await signer.blindSign(keys.privateKeyPkcs8, c.blindedMsg));
    expect(await signer.verify(other.publicKeySpki, msg, sig)).toBe(false);
  });

  it('rejects an altered signature', async () => {
    const msg = buildBallotMessage('election-1', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    const c = await client(msg);
    const sig = Uint8Array.from(
      await c.finalize(await signer.blindSign(keys.privateKeyPkcs8, c.blindedMsg)),
    );
    sig[sig.length - 1] ^= 0x01;
    expect(await signer.verify(keys.publicKeySpki, msg, sig)).toBe(false);
  });

  it('rejects a blinded message not below the modulus', async () => {
    await expect(
      signer.blindSign(keys.privateKeyPkcs8, new Uint8Array(256).fill(0xff)),
    ).rejects.toBeInstanceOf(BlindedMessageOutOfRangeError);
  });
});
