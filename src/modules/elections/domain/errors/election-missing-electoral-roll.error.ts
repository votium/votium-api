import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class ElectionMissingElectoralRollError extends ConflictException {
  constructor() {
    super(
      'The election does not have an associated electoral roll.',
      'ELECTION_MISSING_ELECTORAL_ROLL',
    );
  }
}
