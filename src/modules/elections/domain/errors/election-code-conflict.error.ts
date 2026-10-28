import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class ElectionCodeConflictError extends ConflictException {
  constructor() {
    super('An election with this code already exists.', 'ELECTION_CODE_CONFLICT');
  }
}
