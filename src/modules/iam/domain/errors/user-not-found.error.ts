import { NotFoundException } from 'src/shared/exceptions/base/not-found.exception';

export class UserNotFoundError extends NotFoundException {
  constructor(userId: string) {
    super('Usuario', userId, 'USER_NOT_FOUND');
  }
}
