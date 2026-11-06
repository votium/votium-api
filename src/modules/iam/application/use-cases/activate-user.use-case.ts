import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { UserStatus } from '../../domain/value-objects/user-status.vo';
import type { UserEntity } from '../../domain/entities/user.entity';
import type { UserRepository } from '../../domain/repositories/user.repository.interface';
import type { AuditLogPort } from '../ports/audit-log.port';

export class ActivateUserUseCase {
  constructor(
    private readonly users: Pick<UserRepository, 'findById' | 'updateStatus'>,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(targetUserId: string, requestingUserId: string): Promise<UserEntity> {
    const user = await this.users.findById(targetUserId);
    if (!user) throw new UserNotFoundError(targetUserId);

    user.activate();

    const updated = await this.users.updateStatus(targetUserId, UserStatus.ACTIVE);
    if (!updated) throw new UserNotFoundError(targetUserId);

    await this.audit.log('USER_ACTIVATED', requestingUserId, { targetUserId });

    return updated;
  }
}
