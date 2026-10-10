import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class ElectionNoCandidatesError extends ConflictException {
  constructor() {
    super('The election does not have any registered candidacy.', 'ELECTION_NO_CANDIDATES');
  }
}
