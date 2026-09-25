import { NotFoundException } from 'src/shared/exceptions/base/not-found.exception';

export class CandidacyNotFoundError extends NotFoundException {
  constructor(candidacyId: string) {
    super('Candidacy', candidacyId, 'CANDIDACY_NOT_FOUND');
  }
}
