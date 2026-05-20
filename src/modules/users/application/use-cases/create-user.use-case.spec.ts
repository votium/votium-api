import { ConflictError } from 'src/shared/exceptions/errors/conflict.error';
import { NotFoundError } from 'src/shared/exceptions/errors/not-found.error';
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
    create: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
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
    roles.findById.mockResolvedValue(new RoleEntity('role-1', RoleName.ADMINISTRADOR));
    users.findByEmail.mockResolvedValue(null);
    hasher.hash.mockResolvedValue('hashed');
    users.create.mockResolvedValue(
      new UserEntity(
        'user-1',
        'John',
        'Doe',
        'john@example.com',
        'hashed',
        RoleName.ADMINISTRADOR,
        'role-1',
        UserStatus.ACTIVE,
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-01-01T00:00:00Z'),
      ),
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

    expect(users.create.mock.calls[0][0]).toEqual(
      expect.objectContaining({ email: 'john@example.com', roleId: 'role-1' }),
    );
    expect(audit.log.mock.calls[0]).toEqual(['USER_CREATED', 'admin-1', { userId: 'user-1' }]);
  });

  it('throws on duplicate email', async () => {
    users.findByEmail.mockResolvedValue(
      new UserEntity(
        'existing',
        'Jane',
        'Doe',
        'jane@example.com',
        'hash',
        RoleName.ADMINISTRADOR,
        'role-1',
        UserStatus.ACTIVE,
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-01-01T00:00:00Z'),
      ),
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
    ).rejects.toBeInstanceOf(ConflictError);
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
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
