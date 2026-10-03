import { PrismaService } from '../../src/shared/database/prisma.service';
import { PrismaUserRepository } from '../../src/modules/iam/infrastructure/repositories/prisma-user.repository';
import { UserEntity } from '../../src/modules/iam/domain/entities/user.entity';
import { UserStatus } from '../../src/modules/iam/domain/value-objects/user-status.vo';

describe('PrismaUserRepository integration', () => {
  let prisma: PrismaService;
  let repository: PrismaUserRepository;

  let adminRoleId: string;
  let auditorRoleId: string;

  const suffix = Date.now();
  const usedUserIds: string[] = [];
  // Pre-existing active Auditors are temporarily deactivated so the tests own the
  // global "active Auditor" population, then restored after the suite.
  let preexistingAuditorIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaUserRepository(prisma);

    const admin = await prisma.role.upsert({
      where: { name: 'ADMINISTRATOR' },
      update: {},
      create: { name: 'ADMINISTRATOR' },
    });
    const auditor = await prisma.role.upsert({
      where: { name: 'AUDITOR' },
      update: {},
      create: { name: 'AUDITOR' },
    });
    adminRoleId = admin.id;
    auditorRoleId = auditor.id;

    const preexisting = await prisma.user.findMany({
      where: { role_id: auditorRoleId, status: 'ACTIVE', deleted_at: null },
      select: { id: true },
    });
    preexistingAuditorIds = preexisting.map((a) => a.id);
    if (preexistingAuditorIds.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: preexistingAuditorIds } },
        data: { status: 'DISABLED' },
      });
    }
  });

  afterEach(async () => {
    if (usedUserIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { user_id: { in: usedUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: usedUserIds } } });
      usedUserIds.length = 0;
    }
  });

  afterAll(async () => {
    if (preexistingAuditorIds.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: preexistingAuditorIds } },
        data: { status: 'ACTIVE' },
      });
    }
    await prisma.$disconnect();
  });

  async function seedUser(
    overrides: Partial<{ role_id: string; status: string; deleted_at: Date | null }> = {},
  ): Promise<string> {
    const email = `it-${suffix}-${Math.random().toString(36).slice(2, 10)}@example.com`;
    const row = await prisma.user.create({
      data: {
        first_name: 'Test',
        last_name: 'User',
        email,
        password_hash: 'pbkdf2$placeholder',
        role_id: overrides.role_id ?? adminRoleId,
        status: overrides.status ?? 'ACTIVE',
        deleted_at: overrides.deleted_at ?? null,
      },
    });
    usedUserIds.push(row.id);
    return row.id;
  }

  it('IU-01: findById excludes logically deleted users', async () => {
    const id = await seedUser();
    await prisma.user.update({ where: { id }, data: { deleted_at: new Date() } });

    await expect(repository.findById(id)).resolves.toBeNull();
  });

  it('IU-02: findAll excludes logically deleted users', async () => {
    const live = await seedUser();
    const deleted = await seedUser();
    await prisma.user.update({ where: { id: deleted }, data: { deleted_at: new Date() } });

    const { users, total } = await repository.findAll({ page: 1, limit: 10 });
    const ids = users.map((u) => u.id);

    expect(total).toBeGreaterThanOrEqual(1);
    expect(ids).toContain(live);
    expect(ids).not.toContain(deleted);
  });

  it('IU-03: updateStatus sets only the status; null for deleted/missing', async () => {
    const id = await seedUser();

    const updated = await repository.updateStatus(id, UserStatus.DISABLED);
    expect(updated).toBeInstanceOf(UserEntity);
    expect(updated?.status).toBe(UserStatus.DISABLED);
    expect(updated?.deletedAt).toBeNull();

    await prisma.user.update({ where: { id }, data: { deleted_at: new Date() } });
    await expect(repository.updateStatus(id, UserStatus.ACTIVE)).resolves.toBeNull();
    await expect(
      repository.updateStatus('00000000-0000-4000-8000-000000000000', UserStatus.ACTIVE),
    ).resolves.toBeNull();
  });

  it('IU-04: softDelete sets deleted_at and preserves row + relationships', async () => {
    const id = await seedUser();

    const result = await repository.softDelete(id);
    expect(result.outcome).toBe('deleted');

    const row = await prisma.user.findUnique({ where: { id } });
    expect(row).not.toBeNull();
    expect(row?.deleted_at).not.toBeNull();
    expect(row?.role_id).toBe(adminRoleId);
    expect(row?.first_name).toBe('Test');
  });

  it('IU-05: deactivate a non-Auditor', async () => {
    const id = await seedUser();

    const result = await repository.deactivate(id);
    expect(result.outcome).toBe('deactivated');

    const row = await prisma.user.findUnique({ where: { id } });
    expect(row?.status).toBe('DISABLED');
    expect(row?.deleted_at).toBeNull();
  });

  it('IU-06: deactivate the last active Auditor is blocked', async () => {
    const id = await seedUser({ role_id: auditorRoleId });

    const result = await repository.deactivate(id);
    expect(result.outcome).toBe('last_auditor');

    const row = await prisma.user.findUnique({ where: { id } });
    expect(row?.status).toBe('ACTIVE');
  });

  it('IU-07: deactivate an Auditor when another active Auditor exists', async () => {
    await seedUser({ role_id: auditorRoleId });
    const target = await seedUser({ role_id: auditorRoleId });

    const result = await repository.deactivate(target);
    expect(result.outcome).toBe('deactivated');

    const row = await prisma.user.findUnique({ where: { id: target } });
    expect(row?.status).toBe('DISABLED');
  });

  it('IU-08: softDelete the last active Auditor is blocked', async () => {
    const id = await seedUser({ role_id: auditorRoleId });

    const result = await repository.softDelete(id);
    expect(result.outcome).toBe('last_auditor');

    const row = await prisma.user.findUnique({ where: { id } });
    expect(row?.deleted_at).toBeNull();
  });

  it('IU-09: softDelete an Auditor when another active Auditor exists', async () => {
    await seedUser({ role_id: auditorRoleId });
    const target = await seedUser({ role_id: auditorRoleId });

    const result = await repository.softDelete(target);
    expect(result.outcome).toBe('deleted');

    const row = await prisma.user.findUnique({ where: { id: target } });
    expect(row?.deleted_at).not.toBeNull();
  });

  it('IU-10: softDelete an already-deleted user', async () => {
    const id = await seedUser();
    await repository.softDelete(id);

    const result = await repository.softDelete(id);
    expect(result.outcome).toBe('already_deleted');
  });

  it('IU-11: softDelete a missing user', async () => {
    const result = await repository.softDelete('00000000-0000-4000-8000-000000000000');
    expect(result.outcome).toBe('not_found');
  });

  it('IU-12: concurrent softDelete of two Auditors leaves at least one active Auditor', async () => {
    const a = await seedUser({ role_id: auditorRoleId });
    const b = await seedUser({ role_id: auditorRoleId });

    const [ra, rb] = await Promise.all([repository.softDelete(a), repository.softDelete(b)]);

    const outcomes = [ra.outcome, rb.outcome].sort();
    // At most one delete can commit; the loser must be blocked by the invariant.
    expect(outcomes.filter((o) => o === 'deleted')).toHaveLength(1);
    expect(outcomes.filter((o) => o === 'last_auditor')).toHaveLength(1);

    const remaining = await prisma.user.count({
      where: { role_id: auditorRoleId, status: 'ACTIVE', deleted_at: null },
    });
    expect(remaining).toBeGreaterThanOrEqual(1);
  });
});
