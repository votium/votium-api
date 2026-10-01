import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

// Raised whenever a requested lifecycle move is not in ELECTION_TRANSITIONS. The
// message names the current and requested states so the caller can see why the
// transition was refused, without exposing any persistence detail. The set of valid
// next states is deliberately not restated here: ELECTION_TRANSITIONS is the single
// authoritative graph, and duplicating it in the message would let the two drift.
export class ElectionStatusTransitionError extends ConflictException {
  constructor(currentStatus: string, requestedStatus: string) {
    super(
      `Election status cannot be changed from ${currentStatus} to ${requestedStatus}.`,
      'ELECTION_STATUS_TRANSITION_INVALID',
    );
  }
}
