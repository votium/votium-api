import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class IdempotencyKeyConflictError extends ConflictException {
  constructor() {
    super(
      'The idempotency key was already used for a different vote request.',
      'IDEMPOTENCY_KEY_CONFLICT',
    );
  }
}
