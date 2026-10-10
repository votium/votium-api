import { UserEntity } from 'src/modules/iam/domain/entities/user.entity';
import { UserNotFoundError } from 'src/modules/iam/domain/errors/user-not-found.error';
import type { UserRepository } from 'src/modules/iam/domain/repositories/user.repository.interface';
import { RoleName } from 'src/modules/iam/domain/value-objects/role-name.vo';
import { UserStatus } from 'src/modules/iam/domain/value-objects/user-status.vo';
import { GetMeUserUseCase } from './get-me-user.use-case';

describe('GetMeUserUseCase', () => {
  const users: jest.Mocked<UserRepository> = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    save: jest.fn(),
    findAll: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('G10: returns the user when found, resolving exclusively from the sub', async () => {
    users.findById.mockResolvedValue(
      UserEntity.restore({
        id: 'user-1',
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
    const useCase = new GetMeUserUseCase(users);

    await expect(useCase.execute('user-1')).resolves.toBeInstanceOf(UserEntity);
    expect(users.findById.mock.calls).toEqual([['user-1']]);
  });

  it('G11: throws UserNotFoundError when the user does not exist', async () => {
    users.findById.mockResolvedValue(null);
    const useCase = new GetMeUserUseCase(users);

    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('G12: passes the exact sub from the token to the repository', async () => {
    users.findById.mockResolvedValue(
      UserEntity.restore({
        id: 'user-99',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        passwordHash: 'hash',
        role: RoleName.AUDITOR,
        roleId: 'role-2',
        status: UserStatus.ACTIVE,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      }),
    );
    const useCase = new GetMeUserUseCase(users);

    await useCase.execute('user-99');

    expect(users.findById.mock.calls).toEqual([['user-99']]);
  });
});
