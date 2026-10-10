import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { UserAlreadyDeletedError } from '../../domain/errors/user-already-deleted.error';
import { LastAuditorError } from '../../domain/errors/last-auditor.error';
import { UserSelfDeleteError } from '../../domain/errors/user-self-delete.error';
import type { UserRepository } from '../../domain/repositories/user.repository.interface';
import type { AuditLogPort } from '../ports/audit-log.port';

export class DeleteUserUseCase {
  constructor(
    private readonly users: Pick<UserRepository, 'softDelete'>,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(targetUserId: string, requestingUserId: string): Promise<void> {
    if (targetUserId === requestingUserId) throw new UserSelfDeleteError();

    const outcome = await this.users.softDelete(targetUserId);

    switch (outcome.outcome) {
      case 'deleted':
        await this.audit.log('USER_DELETED', requestingUserId, { targetUserId });
        return;
      case 'not_found':
        throw new UserNotFoundError(targetUserId);
      case 'already_deleted':
        throw new UserAlreadyDeletedError(targetUserId);
      case 'last_auditor':
        throw new LastAuditorError('delete');
    }
  }
}
