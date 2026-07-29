import { ValidationException } from 'src/shared/exceptions/base/validation.exception';

export class UserSelfDisableError extends ValidationException {
  constructor() {
    super('Users cannot disable themselves', 'USER_SELF_DISABLE');
  }
}
