import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class RecoveryCodeAlreadyUsedException extends ConflictException {
  constructor() {
    super('Recovery code has already been used.', 'RECOVERY_CODE_ALREADY_USED');
  }
}
