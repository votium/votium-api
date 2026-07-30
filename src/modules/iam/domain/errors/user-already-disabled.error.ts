import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class UserAlreadyDisabledError extends ConflictException {
  constructor(userId: string) {
    super(`User ${userId} is already disabled`, 'USER_ALREADY_DISABLED');
  }
}
