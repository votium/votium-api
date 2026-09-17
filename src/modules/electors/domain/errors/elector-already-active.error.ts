import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class ElectorAlreadyActiveError extends ConflictException {
  constructor(electorId: string) {
    super(`Elector ${electorId} is already active`, 'ELECTOR_ALREADY_ACTIVE');
  }
}
