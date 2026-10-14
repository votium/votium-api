import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class VoteAlreadyRegisteredError extends ConflictException {
  constructor(electionId: string) {
    super(
      `Vote for election ${electionId} is already registered for this elector.`,
      'VOTE_ALREADY_REGISTERED',
    );
  }
}
