import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class ElectionHasVotesError extends ConflictException {
  constructor() {
    super('Election cannot be deleted because it has associated votes.', 'ELECTION_HAS_VOTES');
  }
}
