import { randomBytes } from 'crypto';
import { pemToSpki, bytesToHex } from '../../src/modules/anonymous-voting/domain/crypto/pem';
import { buildBallotMessage } from '../../src/modules/anonymous-voting/domain/crypto/ballot-message';
import { loadBlindRsaSuite } from '../../src/modules/anonymous-voting/domain/crypto/rsabssa-blind-signature';
import { commitmentOf } from '../../src/modules/anonymous-voting/domain/crypto/schnorr-zkp';

// Client-side helpers. The real client lives in votium-web; these mirror it so the server is
// exercised with genuine blinded messages and signatures.

// Order of the Ristretto255 group (prime subgroup of Curve25519).
const GROUP_ORDER = 7237005577332262213973186563042994240857116359379907606001950938285454250989n;

export function randomSecretHex(): string {
  let x = 0n;
  while (x === 0n) {
    x = BigInt(`0x${randomBytes(64).toString('hex')}`) % GROUP_ORDER;
  }
  return x.toString(16).padStart(64, '0');
}

// y = x*G, Ristretto255 encoding in lowercase hex.
export function publicCommitmentHex(secretHex: string): Promise<string> {
  return commitmentOf(secretHex);
}

export async function blindForElection(publicKeyPem: string, electionId: string, ballotId: string) {
  const suite = await loadBlindRsaSuite();
  const publicKey = await crypto.subtle.importKey(
    'spki',
    new Uint8Array(pemToSpki(publicKeyPem)),
    { name: 'RSA-PSS', hash: 'SHA-384' },
    true,
    ['verify'],
  );
  const message = buildBallotMessage(electionId, ballotId);
  const prepared = suite.prepare(message);
  const { blindedMsg, inv } = await suite.blind(publicKey, prepared);
  return {
    blindedMessageHex: bytesToHex(blindedMsg),
    unblind: async (blindSignatureHex: string): Promise<string> => {
      const sig = await suite.finalize(
        publicKey,
        prepared,
        new Uint8Array(Buffer.from(blindSignatureHex, 'hex')),
        inv,
      );
      return bytesToHex(sig);
    },
  };
}
