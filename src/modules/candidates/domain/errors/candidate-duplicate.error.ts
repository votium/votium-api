import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class CandidateDuplicateError extends ConflictException {
  constructor() {
    super('Candidate already exists.', 'CANDIDATE_CONFLICT');
  }
}
