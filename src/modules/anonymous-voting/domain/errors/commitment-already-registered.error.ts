import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class CommitmentAlreadyRegisteredError extends ConflictException {
  constructor() {
    super(
      'This eligibility commitment is already registered for the election.',
      'COMMITMENT_ALREADY_REGISTERED',
    );
  }
}
