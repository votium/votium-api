import { DomainException } from 'src/shared/exceptions/base/domain.exception';

export class BlindedMessageOutOfRangeError extends DomainException {
  constructor() {
    super('INVALID_BLINDED_MESSAGE', 'Blinded message is not a valid RSA group element.');
  }
}
