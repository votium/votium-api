import { createHash, randomBytes } from 'crypto';
import type { ristretto255 } from '@noble/curves/ed25519.js';

// Schnorr proof of knowledge of x such that y = x*G on the Ristretto255 group, made
// non-interactive with Fiat-Shamir. The challenge binds the whole transcript, so a proof
// generated for one ballot/candidacy cannot be replayed with another.
//
// Encoding (identical in votium-web): points are 32-byte Ristretto encodings in lowercase
// hex (64 chars); scalars are 32-byte big-endian integers in lowercase hex (64 chars) that
// must be strictly less than the group order.

type Curve = typeof ristretto255;
type Point = InstanceType<Curve['Point']>;

// @noble/curves is ESM-only, so it is loaded with a dynamic import.
let curvePromise: Promise<Curve> | undefined;
function loadCurve(): Promise<Curve> {
  curvePromise ??= import('@noble/curves/ed25519.js').then((lib) => lib.ristretto255);
  return curvePromise;
}

const HEX_32 = /^[0-9a-f]{64}$/;
const DOMAIN = 'votium-anonymous-voting/schnorr-ristretto255/v1';

export interface SchnorrTranscript {
  electionId: string;
  ballotId: string;
  // Candidacy UUID or the literal 'blank'.
  candidacyId: string;
}

export interface SchnorrProof {
  y: string;
  t: string;
  c: string;
  s: string;
}

export function challengeOf(
  curveFn: Curve,
  tHex: string,
  yHex: string,
  transcript: SchnorrTranscript,
): bigint {
  const input = [
    DOMAIN,
    tHex,
    yHex,
    transcript.electionId,
    transcript.ballotId,
    transcript.candidacyId,
  ].join('|');
  const digest = createHash('sha512').update(input, 'utf8').digest('hex');
  return curveFn.Point.Fn.create(BigInt(`0x${digest}`));
}

export function scalarToHex(value: bigint): string {
  return value.toString(16).padStart(64, '0');
}

// Parses a canonical scalar (exactly 64 hex chars, value < order). Returns null otherwise.
function parseCanonicalScalar(curveFn: Curve, hex: string): bigint | null {
  if (!HEX_32.test(hex)) return null;
  const value = BigInt(`0x${hex}`);
  return value < curveFn.Point.Fn.ORDER ? value : null;
}

function parsePoint(curveFn: Curve, hex: string): Point | null {
  if (!HEX_32.test(hex)) return null;
  try {
    return curveFn.Point.fromBytes(Buffer.from(hex, 'hex'));
  } catch {
    return null;
  }
}

export class SchnorrRistrettoZkp {
  // Prover. Runs in the client in production; kept here for tests and cross-checks.
  async prove(secretHex: string, transcript: SchnorrTranscript): Promise<SchnorrProof> {
    const curveFn = await loadCurve();
    const nonce = curveFn.Point.Fn.create(BigInt(`0x${randomBytes(64).toString('hex')}`));
    return this.proveWithScalars(curveFn, secretHex, scalarToHex(nonce), transcript);
  }

  // Deterministic prover for regression vectors. Never call it with a predictable nonce in
  // production code: the nonce must be fresh, otherwise the secret leaks.
  async proveWithNonce(
    secretHex: string,
    transcript: SchnorrTranscript,
    nonceHex: string,
  ): Promise<SchnorrProof> {
    return this.proveWithScalars(await loadCurve(), secretHex, nonceHex, transcript);
  }

  private proveWithScalars(
    curveFn: Curve,
    secretHex: string,
    nonceHex: string,
    transcript: SchnorrTranscript,
  ): SchnorrProof {
    const Fn = curveFn.Point.Fn;
    const x = parseCanonicalScalar(curveFn, secretHex);
    if (x === null || x === 0n) throw new Error('invalid secret');
    const r = parseCanonicalScalar(curveFn, nonceHex);
    if (r === null || r === 0n) throw new Error('invalid nonce');

    const y = curveFn.Point.BASE.multiply(x);
    const t = curveFn.Point.BASE.multiply(r);
    const yHex = Buffer.from(y.toBytes()).toString('hex');
    const tHex = Buffer.from(t.toBytes()).toString('hex');
    const c = challengeOf(curveFn, tHex, yHex, transcript);
    const s = Fn.create(r + c * x);
    return { y: yHex, t: tHex, c: scalarToHex(c), s: scalarToHex(s) };
  }

  // Verifier. Recomputes c from the transcript instead of trusting the submitted c, then
  // checks s*G == t + c*y.
  async verify(proof: SchnorrProof, transcript: SchnorrTranscript): Promise<boolean> {
    const curveFn = await loadCurve();
    const y = parsePoint(curveFn, proof.y);
    const t = parsePoint(curveFn, proof.t);
    const c = parseCanonicalScalar(curveFn, proof.c);
    const s = parseCanonicalScalar(curveFn, proof.s);
    if (!y || !t || c === null || s === null) return false;

    const expectedC = challengeOf(curveFn, proof.t, proof.y, transcript);
    if (expectedC !== c) return false;

    try {
      const left = curveFn.Point.BASE.multiply(s);
      const right = t.add(y.multiply(c));
      return left.equals(right);
    } catch {
      return false;
    }
  }
}

// Shared by the e2e client helper: the public commitment y = x*G, lowercase hex.
export async function commitmentOf(secretHex: string): Promise<string> {
  const curveFn = await loadCurve();
  const x = parseCanonicalScalar(curveFn, secretHex);
  if (x === null || x === 0n) throw new Error('invalid secret');
  return Buffer.from(curveFn.Point.BASE.multiply(x).toBytes()).toString('hex');
}
