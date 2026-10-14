import { UserEmailAlreadyExistsException } from '../../domain/errors/user-email-already-exists.exception';
import { NotFoundException } from 'src/shared/exceptions/base/not-found.exception';
import { CreateUserUseCase } from './create-user.use-case';
import { RoleEntity } from '../../domain/entities/role.entity';
import { RoleName } from '../../domain/value-objects/role-name.vo';
import { UserStatus } from '../../domain/value-objects/user-status.vo';
import type { UserRepository } from '../../domain/repositories/user.repository.interface';
import type { RoleRepository } from '../../domain/repositories/role.repository.interface';
import type { PasswordHasherPort } from '../ports/password-hasher.port';
import type { AuditLogPort } from '../ports/audit-log.port';
import { UserEntity } from '../../domain/entities/user.entity';

describe('CreateUserUseCase', () => {
  const users: jest.Mocked<UserRepository> = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    save: jest.fn(),
    findAll: jest.fn(),
  };
  const roles: jest.Mocked<RoleRepository> = {
    findById: jest.fn(),
    findByName: jest.fn(),
    ensureExists: jest.fn(),
  };
  const hasher: jest.Mocked<PasswordHasherPort> = {
    hash: jest.fn(),
    verify: jest.fn(),
  };
  const audit: jest.Mocked<Pick<AuditLogPort, 'log'>> = {
    log: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('creates a user and logs audit', async () => {
    roles.findById.mockResolvedValue(RoleEntity.restore('role-1', RoleName.ADMINISTRATOR));
    users.findByEmail.mockResolvedValue(null);
    hasher.hash.mockResolvedValue('hashed');
    users.save.mockResolvedValue(
      UserEntity.restore({
        id: 'user-1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        passwordHash: 'hashed',
        role: RoleName.ADMINISTRATOR,
        roleId: 'role-1',
        status: UserStatus.ACTIVE,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      }),
    );

    const useCase = new CreateUserUseCase(users, roles, hasher, audit);

    await useCase.execute({
      firstName: 'John',
      lastName: 'Doe',
      email: 'JOHN@example.com',
      password: 'SecurePass123!',
      roleId: 'role-1',
      status: UserStatus.ACTIVE,
      requestingUserId: 'admin-1',
    });

    expect(users.save.mock.calls[0][0]).toEqual(
      expect.objectContaining({ email: 'john@example.com', roleId: 'role-1' }),
    );
    expect(audit.log.mock.calls[0]).toEqual(['USER_CREATED', 'admin-1', { userId: 'user-1' }]);
  });

  it('throws on duplicate email', async () => {
    users.findByEmail.mockResolvedValue(
      UserEntity.restore({
        id: 'existing',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        passwordHash: 'hash',
        role: RoleName.ADMINISTRATOR,
        roleId: 'role-1',
        status: UserStatus.ACTIVE,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      }),
    );
    const useCase = new CreateUserUseCase(users, roles, hasher, audit);

    await expect(
      useCase.execute({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'SecurePass123!',
        roleId: 'role-1',
        requestingUserId: 'admin-1',
      }),
    ).rejects.toBeInstanceOf(UserEmailAlreadyExistsException);
  });

  it('throws when role is missing', async () => {
    users.findByEmail.mockResolvedValue(null);
    roles.findById.mockResolvedValue(null);
    const useCase = new CreateUserUseCase(users, roles, hasher, audit);

    await expect(
      useCase.execute({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        password: 'SecurePass123!',
        roleId: 'role-1',
        requestingUserId: 'admin-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
