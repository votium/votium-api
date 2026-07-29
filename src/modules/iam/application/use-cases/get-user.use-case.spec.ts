import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import { GetUserUseCase } from './get-user.use-case';
import type { UserRepository } from '../../domain/repositories/user.repository.interface';
import { UserEntity } from '../../domain/entities/user.entity';
import { RoleName } from '../../domain/value-objects/role-name.vo';
import { UserStatus } from '../../domain/value-objects/user-status.vo';

describe('GetUserUseCase', () => {
  const users: jest.Mocked<UserRepository> = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    save: jest.fn(),
    findAll: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('returns a user when found', async () => {
    users.findById.mockResolvedValue(
      UserEntity.restore({
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
      }),
    );
    const useCase = new GetUserUseCase(users);

    await expect(useCase.execute('user-1')).resolves.toBeInstanceOf(UserEntity);
  });

  it('throws when user not found', async () => {
    users.findById.mockResolvedValue(null);
    const useCase = new GetUserUseCase(users);

    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(UserNotFoundError);
  });
});
