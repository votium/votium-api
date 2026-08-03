import { DomainException } from './domain.exception';

export class UnauthorizedException extends DomainException {
  constructor(message: string, code?: string) {
    super(code ?? 'UNAUTHORIZED', message);
  }
}
