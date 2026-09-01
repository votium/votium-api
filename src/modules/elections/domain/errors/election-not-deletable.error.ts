import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class ElectionNotDeletableError extends ConflictException {
  constructor() {
    super('Election cannot be deleted in its current state.', 'ELECTION_NOT_DELETABLE');
  }
}
