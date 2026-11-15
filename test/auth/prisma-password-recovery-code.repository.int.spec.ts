import { randomUUID } from 'crypto';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { MAX_PASSWORD_RECOVERY_ATTEMPTS } from '../../src/shared/constants/password-recovery.constants';
import { PrismaPasswordRecoveryCodeRepository } from '../../src/modules/auth/infrastructure/repositories/prisma-password-recovery-code.repository';

describe('PrismaPasswordRecoveryCodeRepository integration', () => {
  let prisma: PrismaService;
  let repository: PrismaPasswordRecoveryCodeRepository;
  const accountIds: string[] = [];

  const HOUR = 60 * 60 * 1000;
  const future = () => new Date(Date.now() + HOUR);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaPasswordRecoveryCodeRepository(prisma);
  });

  afterEach(async () => {
    await prisma.passwordRecoveryCode.deleteMany({ where: { user_id: { in: accountIds } } });
    await prisma.user.deleteMany({ where: { id: { in: accountIds } } });
    accountIds.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedAccount(status = 'ACTIVE', deletedAt: Date | null = null): Promise<string> {
    const tag = randomUUID();
    const row = await seedUser(tag, status, deletedAt);
    accountIds.push(row.id);
    return row.id;
  }

  async function seedUser(tag: string, status: string, deletedAt: Date | null) {
    const role = await prisma.role.upsert({
      where: { name: 'ADMINISTRATOR' },
      update: {},
      create: { name: 'ADMINISTRATOR' },
    });
    return prisma.user.create({
      data: {
        first_name: 'Recovery',
        last_name: 'Repo',
        email: `recovery-repo-${tag}@example.com`,
        password_hash: 'old-hash',
        role_id: role.id,
        status,
        deleted_at: deletedAt,
      },
    });
  }

  const passwordOf = async (id: string) =>
    (await prisma.user.findUniqueOrThrow({ where: { id } })).password_hash;
  const codesOf = (id: string) => prisma.passwordRecoveryCode.findMany({ where: { user_id: id } });

  async function seedCode(
    accountId: string,
    data: { codeHash?: string; expiresAt?: Date; attempts?: number; consumedAt?: Date | null },
  ) {
    return prisma.passwordRecoveryCode.create({
      data: {
        user_id: accountId,
        code_hash: data.codeHash ?? 'right-hash',
        expires_at: data.expiresAt ?? future(),
        attempts: data.attempts ?? 0,
        consumed_at: data.consumedAt ?? null,
      },
    });
  }

  const consume = (accountId: string, codeHash = 'right-hash') =>
    repository.consumeAndResetPassword({
      userId: accountId,
      codeHash,
      passwordHash: 'new-hash',
      now: new Date(),
    });

  it('replaceActive keeps a single code per account', async () => {
    const id = await seedAccount();
    await repository.replaceActive({ userId: id, codeHash: 'first', expiresAt: future() });
    await repository.replaceActive({ userId: id, codeHash: 'second', expiresAt: future() });

    const rows = await codesOf(id);
    expect(rows.map((row) => row.code_hash)).toEqual(['second']);
  });

  it('deleteByUserId removes every code of the account', async () => {
    const id = await seedAccount();
    await seedCode(id, {});

    await repository.deleteByUserId(id);

    expect(await codesOf(id)).toHaveLength(0);
  });

  it('findActiveCreatedAt returns created_at of the current code, null when consumed/expired/none', async () => {
    const id = await seedAccount();
    expect(await repository.findActiveCreatedAt(id, new Date())).toBeNull();

    const row = await seedCode(id, {});
    expect(await repository.findActiveCreatedAt(id, new Date())).toEqual(row.created_at);

    await prisma.passwordRecoveryCode.update({
      where: { id: row.id },
      data: { consumed_at: new Date() },
    });
    expect(await repository.findActiveCreatedAt(id, new Date())).toBeNull();

    await seedCode(id, { expiresAt: new Date(Date.now() - 1000) });
    expect(await repository.findActiveCreatedAt(id, new Date())).toBeNull();
  });

  it('consumes a valid code and updates password_hash in the same transaction', async () => {
    const id = await seedAccount();
    await seedCode(id, {});

    await expect(consume(id)).resolves.toBe('updated');

    expect(await passwordOf(id)).toBe('new-hash');
    const [row] = await codesOf(id);
    expect(row.consumed_at).not.toBeNull();
  });

  it('returns invalid and increments attempts for a wrong code', async () => {
    const id = await seedAccount();
    await seedCode(id, {});

    await expect(consume(id, 'wrong-hash')).resolves.toBe('invalid');

    const [row] = await codesOf(id);
    expect(row.attempts).toBe(1);
    expect(await passwordOf(id)).toBe('old-hash');
  });

  it('removes the code when the last allowed attempt fails, and reports attempts_exceeded after', async () => {
    const id = await seedAccount();
    await seedCode(id, { attempts: MAX_PASSWORD_RECOVERY_ATTEMPTS - 1 });

    await expect(consume(id, 'wrong-hash')).resolves.toBe('invalid');
    expect(await codesOf(id)).toHaveLength(0);

    await seedCode(id, { attempts: MAX_PASSWORD_RECOVERY_ATTEMPTS });
    await expect(consume(id)).resolves.toBe('attempts_exceeded');
    expect(await codesOf(id)).toHaveLength(0);
  });

  it('returns expired for an expired code and used for a consumed one', async () => {
    const expiredId = await seedAccount();
    await seedCode(expiredId, { expiresAt: new Date(Date.now() - 1000) });
    await expect(consume(expiredId)).resolves.toBe('expired');

    const usedId = await seedAccount();
    await seedCode(usedId, { consumedAt: new Date() });
    await expect(consume(usedId)).resolves.toBe('used');
  });

  it('returns invalid when there is no code', async () => {
    const id = await seedAccount();
    await expect(consume(id)).resolves.toBe('invalid');
  });

  it('lets only one of two concurrent resets succeed', async () => {
    const id = await seedAccount();
    await seedCode(id, {});

    const outcomes = await Promise.all([consume(id), consume(id)]);

    expect(outcomes.sort()).toEqual(['updated', 'used']);
  });

  it.each([
    ['disabled/inactive', 'DISABLED', null],
    ['deleted', 'ACTIVE', new Date()],
  ])(
    'rolls back for a %s account: password unchanged and code not consumed',
    async (_l, status, deletedAt) => {
      const id = await seedAccount(status, deletedAt);
      await seedCode(id, {});

      await expect(consume(id)).resolves.toBe('invalid');

      expect(await passwordOf(id)).toBe('old-hash');
      const [row] = await codesOf(id);
      expect(row.consumed_at).toBeNull();
    },
  );

  it('stores codes only in its own context table', async () => {
    const id = await seedAccount();
    await repository.replaceActive({ userId: id, codeHash: 'right-hash', expiresAt: future() });

    expect(await codesOf(id)).toHaveLength(1);
    expect(await prisma.electorPasswordRecoveryCode.count({ where: { elector_id: id } })).toBe(0);
  });
});
