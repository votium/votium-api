import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class ElectionCodeExhaustedError extends ConflictException {
  constructor(period: string) {
    super(`No election codes are available for period ${period}.`, 'ELECTION_CODE_EXHAUSTED');
  }
}
