import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { UserAlreadyActiveError } from '../../domain/errors/user-already-active.error';
import { UserStatus } from '../../domain/value-objects/user-status.vo';
import { RoleName } from '../../domain/value-objects/role-name.vo';
import { UserEntity } from '../../domain/entities/user.entity';
import { ActivateUserUseCase } from './activate-user.use-case';
import type { UserRepository } from '../../domain/repositories/user.repository.interface';
import type { AuditLogPort } from '../ports/audit-log.port';

function buildUser(status: UserStatus): UserEntity {
  return UserEntity.restore({
    id: 'user-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    passwordHash: 'hash',
    role: RoleName.ADMINISTRATOR,
    roleId: 'role-1',
    status,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  });
}

describe('ActivateUserUseCase', () => {
  const users: jest.Mocked<Pick<UserRepository, 'findById' | 'updateStatus'>> = {
    findById: jest.fn(),
    updateStatus: jest.fn(),
  };
  const audit: jest.Mocked<Pick<AuditLogPort, 'log'>> = {
    log: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('activates an inactive user and logs audit', async () => {
    users.findById.mockResolvedValue(buildUser(UserStatus.DISABLED));
    users.updateStatus.mockResolvedValue(buildUser(UserStatus.ACTIVE));
    const useCase = new ActivateUserUseCase(users, audit);

    const result = await useCase.execute('user-1', 'admin-1');

    expect(result.status).toBe(UserStatus.ACTIVE);
    expect(users.updateStatus.mock.calls[0]).toEqual(['user-1', UserStatus.ACTIVE]);
    expect(audit.log.mock.calls[0]).toEqual([
      'USER_ACTIVATED',
      'admin-1',
      { targetUserId: 'user-1' },
    ]);
  });

  it('rejects an already active user', async () => {
    users.findById.mockResolvedValue(buildUser(UserStatus.ACTIVE));
    const useCase = new ActivateUserUseCase(users, audit);

    await expect(useCase.execute('user-1', 'admin-1')).rejects.toBeInstanceOf(
      UserAlreadyActiveError,
    );
    expect(users.updateStatus.mock.calls).toHaveLength(0);
  });

  it('rejects a missing user', async () => {
    users.findById.mockResolvedValue(null);
    const useCase = new ActivateUserUseCase(users, audit);

    await expect(useCase.execute('missing', 'admin-1')).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('rejects a deleted user (excluded from lookup)', async () => {
    users.findById.mockResolvedValue(null);
    const useCase = new ActivateUserUseCase(users, audit);

    await expect(useCase.execute('deleted', 'admin-1')).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('rejects when persistence fails after lookup', async () => {
    users.findById.mockResolvedValue(buildUser(UserStatus.DISABLED));
    users.updateStatus.mockResolvedValue(null);
    const useCase = new ActivateUserUseCase(users, audit);

    await expect(useCase.execute('user-1', 'admin-1')).rejects.toBeInstanceOf(UserNotFoundError);
  });
});
