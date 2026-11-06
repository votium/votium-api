import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class BlankVoteDisabledError extends ConflictException {
  constructor() {
    super('Blank vote is not enabled for this election.', 'BLANK_VOTE_DISABLED');
  }
}
