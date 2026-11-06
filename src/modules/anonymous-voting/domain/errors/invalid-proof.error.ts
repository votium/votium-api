import { DomainException } from 'src/shared/exceptions/base/domain.exception';

export class InvalidProofError extends DomainException {
  constructor() {
    super('INVALID_PROOF', 'The eligibility proof is not valid.');
  }
}
