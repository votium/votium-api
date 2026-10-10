import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class UserAlreadyDeletedError extends ConflictException {
  constructor(userId: string) {
    super(`User ${userId} is already deleted`, 'USER_ALREADY_DELETED');
  }
}
