import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class ElectorDuplicateError extends ConflictException {
  constructor() {
    super('Elector already exists.', 'ELECTOR_CONFLICT');
  }
}
