import { randomUUID } from 'crypto';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { MAX_PASSWORD_RECOVERY_ATTEMPTS } from '../../src/shared/constants/password-recovery.constants';
import { PrismaElectorPasswordRecoveryCodeRepository } from '../../src/modules/auth/infrastructure/repositories/prisma-elector-password-recovery-code.repository';

describe('PrismaElectorPasswordRecoveryCodeRepository integration', () => {
  let prisma: PrismaService;
  let repository: PrismaElectorPasswordRecoveryCodeRepository;
  const accountIds: string[] = [];

  const HOUR = 60 * 60 * 1000;
  const future = () => new Date(Date.now() + HOUR);

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaElectorPasswordRecoveryCodeRepository(prisma);
  });

  afterEach(async () => {
    await prisma.electorPasswordRecoveryCode.deleteMany({
      where: { elector_id: { in: accountIds } },
    });
    await prisma.elector.deleteMany({ where: { id: { in: accountIds } } });
    accountIds.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedAccount(status = 'ACTIVE', deletedAt: Date | null = null): Promise<string> {
    const tag = randomUUID();
    const row = await seedElector(tag, status, deletedAt);
    accountIds.push(row.id);
    return row.id;
  }

  async function seedElector(tag: string, status: string, deletedAt: Date | null) {
    return prisma.elector.create({
      data: {
        first_name: 'Recovery',
        last_name: 'Repo',
        email: `elector-recovery-repo-${tag}@example.com`,
        password_hash: 'old-hash',
        student_code: `REC-${tag}`,
        program_code: '2710',
        status,
        deleted_at: deletedAt,
      },
    });
  }

  const passwordOf = async (id: string) =>
    (await prisma.elector.findUniqueOrThrow({ where: { id } })).password_hash;
  const codesOf = (id: string) =>
    prisma.electorPasswordRecoveryCode.findMany({ where: { elector_id: id } });

  async function seedCode(
    accountId: string,
    data: { codeHash?: string; expiresAt?: Date; attempts?: number; consumedAt?: Date | null },
  ) {
    return prisma.electorPasswordRecoveryCode.create({
      data: {
        elector_id: accountId,
        code_hash: data.codeHash ?? 'right-hash',
        expires_at: data.expiresAt ?? future(),
        attempts: data.attempts ?? 0,
        consumed_at: data.consumedAt ?? null,
      },
    });
  }

  const consume = (accountId: string, codeHash = 'right-hash') =>
    repository.consumeAndResetPassword({
      electorId: accountId,
      codeHash,
      passwordHash: 'new-hash',
      now: new Date(),
    });

  it('replaceActive keeps a single code per account', async () => {
    const id = await seedAccount();
    await repository.replaceActive({ electorId: id, codeHash: 'first', expiresAt: future() });
    await repository.replaceActive({ electorId: id, codeHash: 'second', expiresAt: future() });

    const rows = await codesOf(id);
    expect(rows.map((row) => row.code_hash)).toEqual(['second']);
  });

  it('deleteByElectorId removes every code of the account', async () => {
    const id = await seedAccount();
    await seedCode(id, {});

    await repository.deleteByElectorId(id);

    expect(await codesOf(id)).toHaveLength(0);
  });

  it('findActiveCreatedAt returns created_at of the current code, null when consumed/expired/none', async () => {
    const id = await seedAccount();
    expect(await repository.findActiveCreatedAt(id, new Date())).toBeNull();

    const row = await seedCode(id, {});
    expect(await repository.findActiveCreatedAt(id, new Date())).toEqual(row.created_at);

    await prisma.electorPasswordRecoveryCode.update({
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
    ['disabled/inactive', 'INACTIVE', null],
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
    await repository.replaceActive({ electorId: id, codeHash: 'right-hash', expiresAt: future() });

    expect(await codesOf(id)).toHaveLength(1);
    expect(await prisma.passwordRecoveryCode.count({ where: { user_id: id } })).toBe(0);
  });
});
