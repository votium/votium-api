import { DomainException } from './domain.exception';

export class InternalServerErrorException extends DomainException {
  constructor(message: string, code?: string) {
    super(code ?? 'INTERNAL_SERVER_ERROR', message);
  }
}
