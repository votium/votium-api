import { DomainException } from './domain.exception';

export class ForbiddenException extends DomainException {
  constructor(message: string, code?: string) {
    super(code ?? 'FORBIDDEN', message);
  }
}
