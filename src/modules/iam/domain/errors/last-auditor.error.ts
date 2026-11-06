import { ConflictException } from 'src/shared/exceptions/base/conflict.exception';

export class LastAuditorError extends ConflictException {
  constructor(action: 'delete' | 'deactivate') {
    const verb = action === 'delete' ? 'deleted' : 'deactivated';
    super(
      `The user cannot be ${verb} because the system must have at least one active Auditor.`,
      'LAST_AUDITOR',
    );
  }
}
