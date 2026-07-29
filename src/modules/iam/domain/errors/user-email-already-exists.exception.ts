import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class UserEmailAlreadyExistsException extends ConflictException {
  constructor() {
    super('Email is already in use', 'EMAIL_CONFLICT');
  }
}
