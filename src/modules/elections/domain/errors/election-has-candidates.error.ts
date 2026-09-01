import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class ElectionHasCandidatesError extends ConflictException {
  constructor() {
    super(
      'Election cannot be deleted because it has associated candidates.',
      'ELECTION_HAS_CANDIDATES',
    );
  }
}
