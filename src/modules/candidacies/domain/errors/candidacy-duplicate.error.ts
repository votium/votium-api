import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class CandidacyDuplicateError extends ConflictException {
  constructor() {
    super('Candidate is already registered in this election.', 'CANDIDACY_DUPLICATE');
  }
}
