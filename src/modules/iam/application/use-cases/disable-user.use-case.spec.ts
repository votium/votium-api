import { UserAlreadyDisabledError } from '../../domain/errors/user-already-disabled.error';
import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { UserSelfDisableError } from '../../domain/errors/user-self-disable.error';
import { UserStatus } from '../../domain/value-objects/user-status.vo';
import { DisableUserUseCase } from './disable-user.use-case';
import type { UserRepository } from '../../domain/repositories/user.repository.interface';
import type { AuditLogPort } from '../ports/audit-log.port';
import { UserEntity } from '../../domain/entities/user.entity';
import { RoleName } from '../../domain/value-objects/role-name.vo';

describe('DisableUserUseCase', () => {
  const users: jest.Mocked<UserRepository> = {
    findById: jest.fn(),
    save: jest.fn(),
    findByEmail: jest.fn(),
    findAll: jest.fn(),
  };
  const audit: jest.Mocked<Pick<AuditLogPort, 'log'>> = {
    log: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('disables a user and logs audit', async () => {
    const activeUser = UserEntity.restore({
      id: 'user-1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      passwordHash: 'hash',
      roleName: RoleName.ADMINISTRADOR,
      roleId: 'role-1',
      status: UserStatus.ACTIVE,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    users.findById.mockResolvedValue(activeUser);
    users.save.mockResolvedValue(
      UserEntity.restore({
        id: 'user-1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        passwordHash: 'hash',
        roleName: RoleName.ADMINISTRADOR,
        roleId: 'role-1',
        status: UserStatus.DISABLED,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      }),
    );
    const useCase = new DisableUserUseCase(users, audit);

    await useCase.execute('user-1', 'admin-1');

    expect(users.save.mock.calls[0][0]).toBe(activeUser);
    expect(audit.log.mock.calls[0]).toEqual([
      'USER_DISABLED',
      'admin-1',
      { targetUserId: 'user-1' },
    ]);
  });

  it('rejects self disable', async () => {
    const useCase = new DisableUserUseCase(users, audit);

    await expect(useCase.execute('user-1', 'user-1')).rejects.toBeInstanceOf(UserSelfDisableError);
  });

  it('rejects when already disabled', async () => {
    users.findById.mockResolvedValue(
      UserEntity.restore({
        id: 'user-1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        passwordHash: 'hash',
        roleName: RoleName.ADMINISTRADOR,
        roleId: 'role-1',
        status: UserStatus.DISABLED,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      }),
    );
    const useCase = new DisableUserUseCase(users, audit);

    await expect(useCase.execute('user-1', 'admin-1')).rejects.toBeInstanceOf(
      UserAlreadyDisabledError,
    );
  });

  it('rejects when user missing', async () => {
    users.findById.mockResolvedValue(null);
    const useCase = new DisableUserUseCase(users, audit);

    await expect(useCase.execute('missing', 'admin-1')).rejects.toBeInstanceOf(UserNotFoundError);
  });
});
