import type { SchnorrProof, SchnorrTranscript } from './schnorr-zkp';

export const PROOF_VERIFIER_PORT = 'ProofVerifierPort';

// Verifies the eligibility proof. The Schnorr implementation is ESM-backed; the port keeps the
// use cases testable without loading it.
export interface ProofVerifierPort {
  verify(proof: SchnorrProof, transcript: SchnorrTranscript): Promise<boolean>;
}
