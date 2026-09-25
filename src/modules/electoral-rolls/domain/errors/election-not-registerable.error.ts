import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class ElectionNotRegisterableError extends ConflictException {
  constructor() {
    super(
      'Election cannot accept electoral roll modifications in its current state.',
      'ELECTION_NOT_REGISTERABLE',
    );
  }
}
