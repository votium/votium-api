import { ValidationError } from 'src/shared/exceptions/errors/validation.error';

export class UserSelfDisableError extends ValidationError {
  constructor() {
    super('Users cannot disable themselves');
  }
}
