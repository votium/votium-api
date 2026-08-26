import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class ElectionNotEditableError extends ConflictException {
  constructor() {
    super('Election cannot be modified in its current state.', 'ELECTION_NOT_EDITABLE');
  }
}
