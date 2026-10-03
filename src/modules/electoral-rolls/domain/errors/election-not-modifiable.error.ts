import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class ElectionNotModifiableError extends ConflictException {
  constructor() {
    super(
      'The electoral roll can only be modified while the election is pending.',
      'ELECTION_NOT_MODIFIABLE',
    );
  }
}
