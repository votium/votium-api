import { ValidationException } from 'src/shared/exceptions/base/validation.exception';

export class ElectionStartRequiresUserError extends ValidationException {
  constructor() {
    super('A user is required to start an election.', 'ELECTION_START_REQUIRES_USER');
  }
}
