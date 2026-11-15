import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';

export class InvalidRecoveryCodeException extends BadRequestException {
  constructor() {
    super('Invalid recovery code.', 'RECOVERY_CODE_INVALID');
  }
}
