import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class ElectionNotEligibleForCandidacyError extends ConflictException {
  constructor() {
    super(
      'Election cannot accept candidacies in its current state.',
      'ELECTION_NOT_ELIGIBLE_FOR_CANDIDACY',
    );
  }
}
