import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class ElectionNameConflictError extends ConflictException {
  constructor() {
    super('An election with this name already exists.', 'ELECTION_NAME_CONFLICT');
  }
}
