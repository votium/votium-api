import { Inject, Injectable } from '@nestjs/common';
import { ConflictError } from 'src/shared/exceptions/errors/conflict.error';
import type { UserRepository } from '../../domain/repositories/user.repository.interface';
import type { RoleRepository } from '../../domain/repositories/role.repository.interface';
import { ROLE_REPOSITORY, USER_REPOSITORY } from '../../domain/repositories/tokens';
import type { PasswordHasherPort } from '../ports/password-hasher.port';
import { AUDIT_LOG_PORT, PASSWORD_HASHER_PORT } from '../ports/tokens';
import type { AuditLogPort } from '../ports/audit-log.port';
import { UserStatus } from '../../domain/value-objects/user-status.vo';
import { NotFoundError } from 'src/shared/exceptions/errors/not-found.error';

@Injectable()
export class CreateUserUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    @Inject(PASSWORD_HASHER_PORT) private readonly hasher: PasswordHasherPort,
    @Inject(AUDIT_LOG_PORT) private readonly audit: AuditLogPort,
  ) {}

  async execute(input: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    roleId: string;
    status?: UserStatus;
    requestingUserId: string;
  }) {
    const email = input.email.trim().toLowerCase();
    const existing = await this.users.findByEmail(email);
    if (existing) throw new ConflictError('El email ya esta en uso');

    const role = await this.roles.findById(input.roleId);
    if (!role) throw new NotFoundError('Rol', input.roleId);

    const passwordHash = await this.hasher.hash(input.password);

    const user = await this.users.create({
      firstName: input.firstName,
      lastName: input.lastName,
      email,
      passwordHash,
      roleId: role.id,
      status: input.status ?? UserStatus.ACTIVE,
    });

    if (input.requestingUserId)
      await this.audit.log('USER_CREATED', input.requestingUserId, { userId: user.id });

    return user;
  }
}
