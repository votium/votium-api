import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class CandidateAlreadyActiveError extends ConflictException {
  constructor() {
    super('Candidate is already active.', 'CANDIDATE_ALREADY_ACTIVE');
  }
}
