import { NotFoundException } from 'src/shared/exceptions/base/not-found.exception';

export class ElectionNotFoundError extends NotFoundException {
  constructor(electionId: string) {
    super('Election', electionId, 'ELECTION_NOT_FOUND');
  }
}
