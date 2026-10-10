import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { UserAlreadyDisabledError } from '../../domain/errors/user-already-disabled.error';
import { LastAuditorError } from '../../domain/errors/last-auditor.error';
import { UserSelfDisableError } from '../../domain/errors/user-self-disable.error';
import type { UserRepository } from '../../domain/repositories/user.repository.interface';
import type { AuditLogPort } from '../ports/audit-log.port';

export class DeactivateUserUseCase {
  constructor(
    private readonly users: Pick<UserRepository, 'deactivate'>,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(targetUserId: string, requestingUserId: string): Promise<void> {
    if (targetUserId === requestingUserId) throw new UserSelfDisableError();

    const outcome = await this.users.deactivate(targetUserId);

    switch (outcome.outcome) {
      case 'deactivated':
        await this.audit.log('USER_DEACTIVATED', requestingUserId, { targetUserId });
        return;
      case 'not_found':
        throw new UserNotFoundError(targetUserId);
      case 'already_disabled':
        throw new UserAlreadyDisabledError(targetUserId);
      case 'last_auditor':
        throw new LastAuditorError('deactivate');
    }
  }
}
