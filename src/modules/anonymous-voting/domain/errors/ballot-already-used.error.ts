import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class BallotAlreadyUsedError extends ConflictException {
  constructor() {
    super('This ballot has already been used.', 'BALLOT_ALREADY_USED');
  }
}
