import { GoneException } from 'src/shared/exceptions/base/gone.exception';

export class ExpiredRecoveryCodeException extends GoneException {
  constructor() {
    super('Recovery code has expired.', 'RECOVERY_CODE_EXPIRED');
  }
}
