import { ValidationException } from 'src/shared/exceptions/base/validation.exception';

export class UserSelfDeleteError extends ValidationException {
  constructor() {
    super('Users cannot delete themselves', 'USER_SELF_DELETE');
  }
}
