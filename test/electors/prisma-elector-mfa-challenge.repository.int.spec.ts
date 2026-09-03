import { PrismaService } from '../../src/shared/database/prisma.service';
import { PrismaElectorMfaChallengeRepository } from '../../src/modules/electors/infrastructure/repositories/prisma-elector-mfa-challenge.repository';
import { ElectorMfaChallengeEntity } from '../../src/modules/electors/domain/entities/elector-mfa-challenge.entity';

describe('PrismaElectorMfaChallengeRepository integration', () => {
  let prisma: PrismaService;
  let repository: PrismaElectorMfaChallengeRepository;
  let electorId: string;
  let otherElectorId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaElectorMfaChallengeRepository(prisma);
  });

  beforeEach(async () => {
    const suffix = Date.now();
    const elector = await prisma.elector.create({
      data: {
        first_name: 'MFA',
        last_name: 'Elector',
        email: `elector-mfa-${suffix}@example.com`,
        password_hash: 'hash',
        student_code: `2020${suffix}`,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    const otherElector = await prisma.elector.create({
      data: {
        first_name: 'Other',
        last_name: 'Elector',
        email: `other-elector-${suffix}@example.com`,
        password_hash: 'hash',
        student_code: `2021${suffix}`,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    electorId = elector.id;
    otherElectorId = otherElector.id;
  });

  afterEach(async () => {
    await prisma.electorMfaChallenge.deleteMany({
      where: { elector_id: { in: [electorId, otherElectorId] } },
    });
    await prisma.elector.deleteMany({
      where: { id: { in: [electorId, otherElectorId] } },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates and finds a challenge by session id', async () => {
    const created = await repository.create({
      electorId,
      sessionId: 'session-1',
      otpHash: 'pbkdf2$hashed',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      resendAt: new Date('2026-07-31T00:01:00.000Z'),
    });

    const found = await repository.findBySessionId('session-1');

    expect(found).not.toBeNull();
    expect(found).toEqual(
      expect.objectContaining({
        electorId,
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
      electorId,
      sessionId: 'session-hash-check',
      otpHash: 'pbkdf2$some-salt$some-hash',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      resendAt: null,
    });

    const row = await prisma.electorMfaChallenge.findUnique({
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
      electorId,
      sessionId: 'duplicate-session',
      otpHash: 'hash',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      resendAt: null,
    });

    await expect(
      repository.create({
        electorId,
        sessionId: 'duplicate-session',
        otpHash: 'hash-2',
        expiresAt: new Date('2026-08-01T00:00:00.000Z'),
        resendAt: null,
      }),
    ).rejects.toThrow();
  });

  it('persists attempts, otp hash and timestamps via save', async () => {
    const challenge = await repository.create({
      electorId,
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
      electorId,
      sessionId: 'session-delete',
      otpHash: 'hash',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      resendAt: null,
    });

    await repository.deleteBySessionId('session-delete');

    await expect(repository.findBySessionId('session-delete')).resolves.toBeNull();
  });

  it('invalidates only the challenges of the given elector', async () => {
    await repository.create({
      electorId,
      sessionId: 'elector-a-1',
      otpHash: 'hash',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      resendAt: null,
    });
    await repository.create({
      electorId,
      sessionId: 'elector-a-2',
      otpHash: 'hash',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      resendAt: null,
    });
    await repository.create({
      electorId: otherElectorId,
      sessionId: 'elector-b-1',
      otpHash: 'hash',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      resendAt: null,
    });

    await repository.invalidateByElectorId(electorId);

    await expect(repository.findBySessionId('elector-a-1')).resolves.toBeNull();
    await expect(repository.findBySessionId('elector-a-2')).resolves.toBeNull();
    await expect(repository.findBySessionId('elector-b-1')).resolves.not.toBeNull();
  });

  it('round-trips timestamps with ms precision', async () => {
    const expiresAt = new Date('2026-08-01T10:30:15.123Z');
    const resendAt = new Date('2026-07-31T10:30:15.123Z');

    await repository.create({
      electorId,
      sessionId: 'session-time',
      otpHash: 'hash',
      expiresAt,
      resendAt,
    });

    const found = (await repository.findBySessionId('session-time')) as ElectorMfaChallengeEntity;
    expect(found.expiresAt.getTime()).toBe(expiresAt.getTime());
    expect(found.resendAt!.getTime()).toBe(resendAt.getTime());
  });

  it('cascades deletion when the elector is removed', async () => {
    await repository.create({
      electorId,
      sessionId: 'session-cascade',
      otpHash: 'hash',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
      resendAt: null,
    });

    await prisma.elector.delete({ where: { id: electorId } });

    await expect(repository.findBySessionId('session-cascade')).resolves.toBeNull();
  });
});
