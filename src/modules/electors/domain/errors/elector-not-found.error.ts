import { NotFoundException } from 'src/shared/exceptions/base/not-found.exception';

export class ElectorNotFoundError extends NotFoundException {
  constructor(electorId: string) {
    super('Elector', electorId, 'ELECTOR_NOT_FOUND');
  }
}
