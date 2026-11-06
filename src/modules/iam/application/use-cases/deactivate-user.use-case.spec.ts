import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { UserAlreadyDisabledError } from '../../domain/errors/user-already-disabled.error';
import { LastAuditorError } from '../../domain/errors/last-auditor.error';
import { UserSelfDisableError } from '../../domain/errors/user-self-disable.error';
import { RoleName } from '../../domain/value-objects/role-name.vo';
import { UserStatus } from '../../domain/value-objects/user-status.vo';
import { UserEntity } from '../../domain/entities/user.entity';
import { DeactivateUserUseCase } from './deactivate-user.use-case';
import type { UserRepository } from '../../domain/repositories/user.repository.interface';
import type { AuditLogPort } from '../ports/audit-log.port';

function buildUser(): UserEntity {
  return UserEntity.restore({
    id: 'user-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    passwordHash: 'hash',
    role: RoleName.AUDITOR,
    roleId: 'role-2',
    status: UserStatus.ACTIVE,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  });
}

describe('DeactivateUserUseCase', () => {
  const users: jest.Mocked<Pick<UserRepository, 'deactivate'>> = {
    deactivate: jest.fn(),
  };
  const audit: jest.Mocked<Pick<AuditLogPort, 'log'>> = {
    log: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('deactivates a user and logs audit', async () => {
    users.deactivate.mockResolvedValue({ outcome: 'deactivated', user: buildUser() });
    const useCase = new DeactivateUserUseCase(users, audit);

    await useCase.execute('user-1', 'admin-1');

    expect(audit.log).toHaveBeenCalledWith('USER_DEACTIVATED', 'admin-1', {
      targetUserId: 'user-1',
    });
  });

  it('rejects self-deactivate', async () => {
    const useCase = new DeactivateUserUseCase(users, audit);

    await expect(useCase.execute('user-1', 'user-1')).rejects.toBeInstanceOf(UserSelfDisableError);
    expect(users.deactivate.mock.calls).toHaveLength(0);
  });

  it('rejects when already disabled', async () => {
    users.deactivate.mockResolvedValue({ outcome: 'already_disabled' });
    const useCase = new DeactivateUserUseCase(users, audit);

    await expect(useCase.execute('user-1', 'admin-1')).rejects.toBeInstanceOf(
      UserAlreadyDisabledError,
    );
  });

  it('rejects when user missing', async () => {
    users.deactivate.mockResolvedValue({ outcome: 'not_found' });
    const useCase = new DeactivateUserUseCase(users, audit);

    await expect(useCase.execute('missing', 'admin-1')).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('rejects deactivating the last active Auditor', async () => {
    users.deactivate.mockResolvedValue({ outcome: 'last_auditor' });
    const useCase = new DeactivateUserUseCase(users, audit);

    await expect(useCase.execute('user-1', 'admin-1')).rejects.toBeInstanceOf(LastAuditorError);
  });
});
