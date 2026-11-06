import { DomainException } from './domain.exception';

export class GoneException extends DomainException {
  constructor(message: string, code?: string) {
    super(code ?? 'GONE', message);
  }
}
