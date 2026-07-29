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
    update: jest.fn(),
    findByEmail: jest.fn(),
    create: jest.fn(),
    findAll: jest.fn(),
  };
  const audit: jest.Mocked<Pick<AuditLogPort, 'log'>> = {
    log: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('disables a user and logs audit', async () => {
    users.findById.mockResolvedValue(
      new UserEntity(
        'user-1',
        'John',
        'Doe',
        'john@example.com',
        'hash',
        RoleName.ADMINISTRADOR,
        'role-1',
        UserStatus.ACTIVE,
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-01-01T00:00:00Z'),
      ),
    );
    users.update.mockResolvedValue(
      new UserEntity(
        'user-1',
        'John',
        'Doe',
        'john@example.com',
        'hash',
        RoleName.ADMINISTRADOR,
        'role-1',
        UserStatus.DISABLED,
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-01-01T00:00:00Z'),
      ),
    );
    const useCase = new DisableUserUseCase(users, audit);

    await useCase.execute('user-1', 'admin-1');

    expect(users.update.mock.calls[0]).toEqual(['user-1', { status: UserStatus.DISABLED }]);
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
      new UserEntity(
        'user-1',
        'John',
        'Doe',
        'john@example.com',
        'hash',
        RoleName.ADMINISTRADOR,
        'role-1',
        UserStatus.DISABLED,
        new Date('2026-01-01T00:00:00Z'),
        new Date('2026-01-01T00:00:00Z'),
      ),
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
