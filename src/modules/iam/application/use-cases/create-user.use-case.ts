import { UserEmailAlreadyExistsException } from '../../domain/errors/user-email-already-exists.exception';
import { RoleNotFoundError } from '../../domain/errors/role-not-found.error';
import { UserEntity } from '../../domain/entities/user.entity';
import type { UserRepository } from '../../domain/repositories/user.repository.interface';
import type { RoleRepository } from '../../domain/repositories/role.repository.interface';
import type { PasswordHasherPort } from '../ports/password-hasher.port';
import type { AuditLogPort } from '../ports/audit-log.port';
import { UserStatus } from '../../domain/value-objects/user-status.vo';

export class CreateUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly hasher: PasswordHasherPort,
    private readonly audit: AuditLogPort,
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
    if (existing) throw new UserEmailAlreadyExistsException();

    const role = await this.roles.findById(input.roleId);
    if (!role) throw new RoleNotFoundError(input.roleId);

    const passwordHash = await this.hasher.hash(input.password);

    const user = UserEntity.create({
      firstName: input.firstName,
      lastName: input.lastName,
      email,
      passwordHash,
      role: role.name,
      roleId: role.id,
      status: input.status,
    });

    const saved = await this.users.save(user);

    if (input.requestingUserId)
      await this.audit.log('USER_CREATED', input.requestingUserId, { userId: saved.id });

    return saved;
  }
}
