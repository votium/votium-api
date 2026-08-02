import { PrismaService } from '../../src/shared/database/prisma.service';
import { PrismaMfaChallengeRepository } from '../../src/modules/auth/infrastructure/repositories/prisma-mfa-challenge.repository';
import { MfaChallengeEntity } from '../../src/modules/auth/domain/entities/mfa-challenge.entity';

describe('PrismaMfaChallengeRepository integration', () => {
  let prisma: PrismaService;
  let repository: PrismaMfaChallengeRepository;
  let userId: string;
  let otherUserId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaMfaChallengeRepository(prisma);
  });

  beforeEach(async () => {
    const role = await prisma.role.upsert({
      where: { name: 'ADMINISTRATOR' },
      update: {},
      create: { name: 'ADMINISTRATOR' },
    });
    const user = await prisma.user.create({
      data: {
        first_name: 'MFA',
        last_name: 'Repo',
        email: `mfa-repo-${Date.now()}@example.com`,
        password_hash: 'hash',
        role_id: role.id,
        status: 'ACTIVE',
      },
    });
    const otherUser = await prisma.user.create({
      data: {
        first_name: 'Other',
        last_name: 'User',
        email: `other-${Date.now()}@example.com`,
        password_hash: 'hash',
        role_id: role.id,
        status: 'ACTIVE',
      },
    });
    userId = user.id;
    otherUserId = otherUser.id;
  });

  afterEach(async () => {
    await prisma.mfaChallenge.deleteMany({
      where: { user_id: { in: [userId, otherUserId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [userId, otherUserId] } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates and finds a challenge by session id', async () => {
    const created = await repository.create({
      userId,
      sessionId: 'session-1',
      otpHash: 'pbkdf2$hashed',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      resendAt: new Date('2026-07-31T00:01:00.000Z'),
    });

    const found = await repository.findBySessionId('session-1');

    expect(found).not.toBeNull();
    expect(found).toEqual(
      expect.objectContaining({
        userId,
        sessionId: 'session-1',
        otpHash: 'pbkdf2$hashed',
        attempts: 0,
        consumedAt: null,
      }),
    );
    expect(found!.id).toBe(created.id);
  });

  it('stores the OTP hashed, never in plain text', async () => {
    await repository.create({
      userId,
      sessionId: 'session-hash-check',
      otpHash: 'pbkdf2$some-salt$some-hash',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      resendAt: null,
    });

    const row = await prisma.mfaChallenge.findUnique({
      where: { session_id: 'session-hash-check' },
    });

    expect(row!.otp_hash).toMatch(/^pbkdf2\$/);
    expect(row!.otp_hash).not.toBe('483912');
  });

  it('returns null for an unknown session', async () => {
    await expect(repository.findBySessionId('missing')).resolves.toBeNull();
  });

  it('enforces a unique session id', async () => {
    await repository.create({
      userId,
      sessionId: 'duplicate-session',
      otpHash: 'hash',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      resendAt: null,
    });

    await expect(
      repository.create({
        userId,
        sessionId: 'duplicate-session',
        otpHash: 'hash-2',
        expiresAt: new Date('2026-08-01T00:00:00.000Z'),
        resendAt: null,
      }),
    ).rejects.toThrow();
  });

  it('persists attempts, otp hash and timestamps via save', async () => {
    const challenge = await repository.create({
      userId,
      sessionId: 'session-save',
      otpHash: 'old-hash',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      resendAt: null,
    });

    challenge.attempts = 3;
    challenge.otpHash = 'new-hash';
    challenge.consumedAt = new Date('2026-07-31T12:00:00.000Z');
    await repository.save(challenge);

    const found = await repository.findBySessionId('session-save');
    expect(found).toEqual(
      expect.objectContaining({
        attempts: 3,
        otpHash: 'new-hash',
        consumedAt: new Date('2026-07-31T12:00:00.000Z'),
      }),
    );
  });

  it('deletes a challenge by session id', async () => {
    await repository.create({
      userId,
      sessionId: 'session-delete',
      otpHash: 'hash',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      resendAt: null,
    });

    await repository.deleteBySessionId('session-delete');

    await expect(repository.findBySessionId('session-delete')).resolves.toBeNull();
  });

  it('invalidates only the challenges of the given user', async () => {
    await repository.create({
      userId,
      sessionId: 'user-a-1',
      otpHash: 'hash',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      resendAt: null,
    });
    await repository.create({
      userId,
      sessionId: 'user-a-2',
      otpHash: 'hash',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      resendAt: null,
    });
    await repository.create({
      userId: otherUserId,
      sessionId: 'user-b-1',
      otpHash: 'hash',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      resendAt: null,
    });

    await repository.invalidateByUserId(userId);

    await expect(repository.findBySessionId('user-a-1')).resolves.toBeNull();
    await expect(repository.findBySessionId('user-a-2')).resolves.toBeNull();
    await expect(repository.findBySessionId('user-b-1')).resolves.not.toBeNull();
  });

  it('round-trips timestamps with ms precision', async () => {
    const expiresAt = new Date('2026-08-01T10:30:15.123Z');
    const resendAt = new Date('2026-07-31T10:30:15.123Z');

    await repository.create({
      userId,
      sessionId: 'session-time',
      otpHash: 'hash',
      expiresAt,
      resendAt,
    });

    const found = (await repository.findBySessionId('session-time')) as MfaChallengeEntity;
    expect(found.expiresAt.getTime()).toBe(expiresAt.getTime());
    expect(found.resendAt!.getTime()).toBe(resendAt.getTime());
  });
});
