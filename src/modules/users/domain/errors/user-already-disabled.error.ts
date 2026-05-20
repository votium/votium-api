import { ValidationError } from 'src/shared/exceptions/errors/validation.error';

export class UserAlreadyDisabledError extends ValidationError {
  constructor(userId: string) {
    super(`User ${userId} is already disabled`);
  }
}
