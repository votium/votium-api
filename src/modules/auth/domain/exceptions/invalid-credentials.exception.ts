import { ValidationException } from 'src/shared/exceptions/base/validation.exception';

export class InvalidCredentialsException extends ValidationException {
  constructor() {
    super('Invalid credentials', 'INVALID_CREDENTIALS');
  }
}
