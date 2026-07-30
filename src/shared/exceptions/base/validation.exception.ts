import { DomainException } from './domain.exception';

export class ValidationException extends DomainException {
  constructor(message: string, code?: string) {
    super(code ?? 'VALIDATION_ERROR', message);
  }
}
