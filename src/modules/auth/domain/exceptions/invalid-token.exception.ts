import { ValidationException } from 'src/shared/exceptions/base/validation.exception';

export class InvalidTokenException extends ValidationException {
  constructor() {
    super('Invalid or expired token', 'INVALID_TOKEN');
  }
}
