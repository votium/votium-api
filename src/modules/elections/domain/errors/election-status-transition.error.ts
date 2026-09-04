import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class ElectionStatusTransitionError extends ConflictException {
  constructor() {
    super(
      'Election status cannot be changed in its current state.',
      'ELECTION_STATUS_TRANSITION_INVALID',
    );
  }
}
