import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class ElectionNoValidCandidatesError extends ConflictException {
  constructor(electionId: string) {
    super(`Election ${electionId} has no valid candidates.`, 'ELECTION_NO_VALID_CANDIDATES');
  }
}
