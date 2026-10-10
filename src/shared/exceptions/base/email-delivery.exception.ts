import { DomainException } from './domain.exception';

export class EmailDeliveryException extends DomainException {
  constructor(message: string, code?: string) {
    super(code ?? 'EMAIL_DELIVERY_ERROR', message);
  }
}
