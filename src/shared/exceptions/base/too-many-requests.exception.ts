import { DomainException } from './domain.exception';

export class TooManyRequestsException extends DomainException {
  constructor(message: string, code?: string) {
    super(code ?? 'TOO_MANY_REQUESTS', message);
  }
}
