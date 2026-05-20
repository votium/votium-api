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
    create: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('returns a user when found', async () => {
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
    const useCase = new GetUserUseCase(users);

    await expect(useCase.execute('user-1')).resolves.toBeInstanceOf(UserEntity);
  });

  it('throws when user not found', async () => {
    users.findById.mockResolvedValue(null);
    const useCase = new GetUserUseCase(users);

    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(UserNotFoundError);
  });
});
