export type FabricPhase = 'endorse' | 'submit';

/**
 * Wraps a raw gateway failure with the phase where it happened. 'submit' covers sending the transaction
 * and waiting for its commit status: after endorsement the outcome can no longer be assumed.
 * Internal to the fabric module.
 */
export class FabricPhaseError extends Error {
  constructor(
    readonly phase: FabricPhase,
    readonly txId: string | undefined,
    readonly original: unknown,
  ) {
    super(`fabric ${phase} failed`);
    this.name = 'FabricPhaseError';
  }
}
