import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class ElectionNotPublishedError extends ConflictException {
  constructor() {
    super(
      'Election results can only be synchronized when the election is PUBLISHED.',
      'ELECTION_NOT_PUBLISHED',
    );
  }
}
