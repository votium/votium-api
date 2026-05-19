import { RoleName } from '../../domain/value-objects/role-name.vo';
import { UserEntity } from '../../domain/entities/user.entity';
import type { UserRepository } from '../../domain/repositories/user.repository.interface';
import { ListUsersUseCase } from './list-users.use-case';

function makeUser(overrides?: Partial<UserEntity>): UserEntity {
  return new UserEntity(
    overrides?.id ?? '550e8400-e29b-41d4-a716-446655440000',
    overrides?.name ?? 'John Doe',
    overrides?.email ?? 'john@example.com',
    overrides?.passwordHash ?? 'hashed-password-not-returned',
    overrides?.role ?? RoleName.ADMINISTRADOR,
  );
}

function makeUserList(count: number): UserEntity[] {
  return Array.from({ length: count }, (_, i) =>
    makeUser({
      id: `550e8400-e29b-41d4-a716-4466554400${String(i).padStart(3, '0')}`,
      name: `User ${i + 1}`,
      email: `user${i + 1}@example.com`,
    }),
  );
}

describe('ListUsersUseCase', () => {
  describe('execute', () => {
    it('returns all active users from the repository', async () => {
      const users = makeUserList(3);
      const repository = {
        findAllActive: jest.fn().mockResolvedValue(users),
      } satisfies Partial<UserRepository>;
      const useCase = new ListUsersUseCase(repository as unknown as UserRepository);

      const result = await useCase.execute();

      expect(result).toHaveLength(3);
      expect(result).toEqual(users);
      expect(repository.findAllActive).toHaveBeenCalledTimes(1);
    });

    it('returns empty array when no active users exist', async () => {
      const repository = {
        findAllActive: jest.fn().mockResolvedValue([]),
      } satisfies Partial<UserRepository>;
      const useCase = new ListUsersUseCase(repository as unknown as UserRepository);

      const result = await useCase.execute();

      expect(result).toEqual([]);
      expect(repository.findAllActive).toHaveBeenCalledTimes(1);
    });

    it('propagates repository errors', async () => {
      const error = new Error('Database connection failed');
      const repository = {
        findAllActive: jest.fn().mockRejectedValue(error),
      } satisfies Partial<UserRepository>;
      const useCase = new ListUsersUseCase(repository as unknown as UserRepository);

      await expect(useCase.execute()).rejects.toThrow(error);
    });

    it('only calls findAllActive and no other repository methods', async () => {
      const repository = {
        findAllActive: jest.fn().mockResolvedValue([]),
        findById: jest.fn(),
        findByEmail: jest.fn(),
        create: jest.fn(),
        updateRole: jest.fn(),
      } satisfies Partial<UserRepository>;
      const useCase = new ListUsersUseCase(repository);

      await useCase.execute();

      expect(repository.findAllActive).toHaveBeenCalledTimes(1);
      expect(repository.findById).not.toHaveBeenCalled();
      expect(repository.findByEmail).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.updateRole).not.toHaveBeenCalled();
    });
  });
});
