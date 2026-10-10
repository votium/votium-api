import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { UserAlreadyDeletedError } from '../../domain/errors/user-already-deleted.error';
import { LastAuditorError } from '../../domain/errors/last-auditor.error';
import { UserSelfDeleteError } from '../../domain/errors/user-self-delete.error';
import { RoleName } from '../../domain/value-objects/role-name.vo';
import { UserStatus } from '../../domain/value-objects/user-status.vo';
import { UserEntity } from '../../domain/entities/user.entity';
import { DeleteUserUseCase } from './delete-user.use-case';
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

describe('DeleteUserUseCase', () => {
  const users: jest.Mocked<Pick<UserRepository, 'softDelete'>> = {
    softDelete: jest.fn(),
  };
  const audit: jest.Mocked<Pick<AuditLogPort, 'log'>> = {
    log: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('deletes a user and logs audit', async () => {
    users.softDelete.mockResolvedValue({ outcome: 'deleted', user: buildUser() });
    const useCase = new DeleteUserUseCase(users, audit);

    await useCase.execute('user-1', 'admin-1');

    expect(audit.log).toHaveBeenCalledWith('USER_DELETED', 'admin-1', {
      targetUserId: 'user-1',
    });
  });

  it('rejects deleting an already deleted user', async () => {
    users.softDelete.mockResolvedValue({ outcome: 'already_deleted' });
    const useCase = new DeleteUserUseCase(users, audit);

    await expect(useCase.execute('user-1', 'admin-1')).rejects.toBeInstanceOf(
      UserAlreadyDeletedError,
    );
  });

  it('rejects a missing user', async () => {
    users.softDelete.mockResolvedValue({ outcome: 'not_found' });
    const useCase = new DeleteUserUseCase(users, audit);

    await expect(useCase.execute('missing', 'admin-1')).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('rejects self-delete', async () => {
    const useCase = new DeleteUserUseCase(users, audit);

    await expect(useCase.execute('user-1', 'user-1')).rejects.toBeInstanceOf(UserSelfDeleteError);
    expect(users.softDelete.mock.calls).toHaveLength(0);
  });

  it('rejects deleting the last active Auditor', async () => {
    users.softDelete.mockResolvedValue({ outcome: 'last_auditor' });
    const useCase = new DeleteUserUseCase(users, audit);

    await expect(useCase.execute('user-1', 'admin-1')).rejects.toBeInstanceOf(LastAuditorError);
  });
});
