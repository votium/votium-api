import { NotFoundError } from 'src/shared/exceptions/errors/not-found.error';

export class UserNotFoundError extends NotFoundError {
  constructor(userId: string) {
    super('Usuario', userId);
  }
}
