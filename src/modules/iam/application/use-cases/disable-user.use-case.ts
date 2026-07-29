import { Inject, Injectable } from '@nestjs/common';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { UserSelfDisableError } from '../../domain/errors/user-self-disable.error';
import type { UserRepository } from '../../domain/repositories/user.repository.interface';
import { USER_REPOSITORY } from '../../domain/repositories/tokens';
import { AUDIT_LOG_PORT, type AuditLogPort } from '../ports/audit-log.port';

@Injectable()
export class DisableUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(AUDIT_LOG_PORT) private readonly audit: AuditLogPort,
  ) {}

  async execute(targetUserId: string, requestingUserId: string): Promise<void> {
    if (targetUserId === requestingUserId) throw new UserSelfDisableError();

    const user = await this.users.findById(targetUserId);
    if (!user) throw new UserNotFoundError(targetUserId);

    user.disable();

    await this.users.save(user);
    await this.audit.log('USER_DISABLED', requestingUserId, { targetUserId });
  }
}
