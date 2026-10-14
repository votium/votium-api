import { NotFoundException } from 'src/shared/exceptions/base/not-found.exception';

export class CandidateNotFoundError extends NotFoundException {
  constructor(candidateId: string) {
    super('Candidate', candidateId, 'CANDIDATE_NOT_FOUND');
  }
}
