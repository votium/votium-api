import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class UserAlreadyActiveError extends ConflictException {
  constructor(userId: string) {
    super(`User ${userId} is already active`, 'USER_ALREADY_ACTIVE');
  }
}
