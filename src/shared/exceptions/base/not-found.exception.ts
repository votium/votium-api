import { DomainException } from './domain.exception';

export class NotFoundException extends DomainException {
  constructor(resource: string, identifier?: string | number, code?: string) {
    super(
      code ?? 'NOT_FOUND',
      identifier ? `${resource} with id ${identifier} not found` : `${resource} not found`,
    );
  }
}
