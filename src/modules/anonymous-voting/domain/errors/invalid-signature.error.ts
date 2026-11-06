import { DomainException } from 'src/shared/exceptions/base/domain.exception';

export class InvalidSignatureError extends DomainException {
  constructor() {
    super('INVALID_SIGNATURE', 'The ballot signature is not valid.');
  }
}
