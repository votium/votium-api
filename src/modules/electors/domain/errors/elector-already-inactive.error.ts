import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class ElectorAlreadyInactiveError extends ConflictException {
  constructor(electorId: string) {
    super(`Elector ${electorId} is already inactive`, 'ELECTOR_ALREADY_INACTIVE');
  }
}
