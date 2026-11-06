import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class ElectionNotActiveError extends ConflictException {
  constructor(electionId: string) {
    super(`Election ${electionId} is not accepting votes.`, 'ELECTION_NOT_ACTIVE');
  }
}
