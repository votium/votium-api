import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/shared/database/prisma.service';
import { PrismaUserRepository } from 'src/modules/users/infrastructure/repositories/prisma-user.repository';
import { PrismaRoleRepository } from 'src/modules/users/infrastructure/repositories/prisma-role.repository';
import { RoleName } from 'src/modules/users/domain/value-objects/role-name.vo';

let prisma: PrismaService;
let repository: PrismaUserRepository;

beforeAll(async () => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [PrismaService, PrismaUserRepository, PrismaRoleRepository],
  }).compile();

  prisma = module.get(PrismaService);
  repository = module.get(PrismaUserRepository);
});

afterEach(async () => {
  await prisma.user.deleteMany();
  await prisma.role.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function seedRole(name: string): Promise<{ id: string; name: string }> {
  return prisma.role.create({ data: { name } });
}

let emailCounter = 0;
function uniqueEmail(prefix = 'test'): string {
  emailCounter += 1;
  return `${prefix}-${Date.now()}-${emailCounter}@example.com`;
}

describe('PrismaUserRepository', () => {
  describe('findAllActive', () => {
    it('returns only active users excluding soft-deleted ones', async () => {
      const adminRole = await seedRole(RoleName.ADMINISTRADOR);

      await prisma.user.create({
        data: {
          name: 'Active User',
          email: uniqueEmail('active'),
          password_hash: 'hash',
          role_id: adminRole.id,
          deleted_at: null,
        },
      });

      await prisma.user.create({
        data: {
          name: 'Deleted User',
          email: uniqueEmail('deleted'),
          password_hash: 'hash',
          role_id: adminRole.id,
          deleted_at: new Date(),
        },
      });

      const result = await repository.findAllActive();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Active User');
    });

    it('returns all active users when none are deleted', async () => {
      const adminRole = await seedRole(RoleName.ADMINISTRADOR);

      await prisma.user.create({
        data: {
          name: 'User A',
          email: uniqueEmail('a'),
          password_hash: 'hash',
          role_id: adminRole.id,
        },
      });
      await prisma.user.create({
        data: {
          name: 'User B',
          email: uniqueEmail('b'),
          password_hash: 'hash',
          role_id: adminRole.id,
        },
      });
      await prisma.user.create({
        data: {
          name: 'User C',
          email: uniqueEmail('c'),
          password_hash: 'hash',
          role_id: adminRole.id,
        },
      });

      const result = await repository.findAllActive();

      expect(result).toHaveLength(3);
    });

    it('returns empty array when all users are soft-deleted', async () => {
      const adminRole = await seedRole(RoleName.ADMINISTRADOR);

      await prisma.user.create({
        data: {
          name: 'Deleted 1',
          email: uniqueEmail('d1'),
          password_hash: 'hash',
          role_id: adminRole.id,
          deleted_at: new Date(),
        },
      });
      await prisma.user.create({
        data: {
          name: 'Deleted 2',
          email: uniqueEmail('d2'),
          password_hash: 'hash',
          role_id: adminRole.id,
          deleted_at: new Date(),
        },
      });

      const result = await repository.findAllActive();

      expect(result).toHaveLength(0);
    });

    it('returns empty array when database has no users', async () => {
      const result = await repository.findAllActive();

      expect(result).toHaveLength(0);
    });

    it('maps all UserEntity fields correctly from the database', async () => {
      const adminRole = await seedRole(RoleName.ADMINISTRADOR);
      const userId = '550e8400-e29b-41d4-a716-446655440000';

      await prisma.user.create({
        data: {
          id: userId,
          name: 'Full Mapping Check',
          email: uniqueEmail('mapping'),
          password_hash: 'some-password-hash-value',
          role_id: adminRole.id,
        },
      });

      const result = await repository.findAllActive();

      expect(result).toHaveLength(1);
      const entity = result[0];
      expect(entity.id).toBe(userId);
      expect(entity.name).toBe('Full Mapping Check');
      expect(entity.passwordHash).toBe('some-password-hash-value');
      expect(entity.role).toBe(RoleName.ADMINISTRADOR);
    });

    it('maps different roles correctly', async () => {
      const adminRole = await seedRole(RoleName.ADMINISTRADOR);
      const auditorRole = await seedRole(RoleName.AUDITOR);

      await prisma.user.create({
        data: {
          name: 'Admin',
          email: uniqueEmail('admin'),
          password_hash: 'hash',
          role_id: adminRole.id,
        },
      });
      await prisma.user.create({
        data: {
          name: 'Auditor',
          email: uniqueEmail('auditor'),
          password_hash: 'hash',
          role_id: auditorRole.id,
        },
      });

      const result = await repository.findAllActive();

      expect(result).toHaveLength(2);
      const admin = result.find((u) => u.email.includes('admin'));
      const auditor = result.find((u) => u.email.includes('auditor'));
      expect(admin?.role).toBe(RoleName.ADMINISTRADOR);
      expect(auditor?.role).toBe(RoleName.AUDITOR);
    });

    it('returns users with explicit deleted_at = null', async () => {
      const adminRole = await seedRole(RoleName.ADMINISTRADOR);

      await prisma.user.create({
        data: {
          name: 'Explicit Null',
          email: uniqueEmail('explicit'),
          password_hash: 'hash',
          role_id: adminRole.id,
          deleted_at: null,
        },
      });

      const result = await repository.findAllActive();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Explicit Null');
    });
  });
});
