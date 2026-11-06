import { DomainException } from './domain.exception';

export class BadRequestException extends DomainException {
  constructor(message: string, code?: string) {
    super(code ?? 'BAD_REQUEST', message);
  }
}
