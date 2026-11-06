import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class BallotCredentialAlreadyIssuedError extends ConflictException {
  constructor() {
    super(
      'A ballot credential was already issued to this elector for this election.',
      'BALLOT_CREDENTIAL_ALREADY_ISSUED',
    );
  }
}
