import { Inject, Injectable } from '@nestjs/common';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { UserAlreadyDisabledError } from '../../domain/errors/user-already-disabled.error';
import { UserSelfDisableError } from '../../domain/errors/user-self-disable.error';
import type { UserRepository } from '../../domain/repositories/user.repository.interface';
import { USER_REPOSITORY } from '../../domain/repositories/tokens';
import { UserStatus } from '../../domain/value-objects/user-status.vo';
import type { AuditLogPort } from '../ports/audit-log.port';
import { AUDIT_LOG_PORT } from '../ports/tokens';

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
    if (user.status === UserStatus.DISABLED) throw new UserAlreadyDisabledError(targetUserId);

    await this.users.update(targetUserId, { status: UserStatus.DISABLED });
    await this.audit.log('USER_DISABLED', requestingUserId, { targetUserId });
  }
}
