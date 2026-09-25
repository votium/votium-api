import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class ElectoralRegistryDuplicateError extends ConflictException {
  constructor(duplicateCount: number) {
    super(
      `The electoral registry contains ${duplicateCount} duplicate record(s). Import rejected.`,
      'ELECTOR_CONFLICT',
    );
  }
}
