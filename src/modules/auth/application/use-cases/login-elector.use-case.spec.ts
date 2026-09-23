import { Logger } from '@nestjs/common';
import { UnauthorizedException } from 'src/shared/exceptions/base/unauthorized.exception';
import {
  ElectorEntity,
  type RestoreElectorInput,
} from 'src/modules/electors/domain/entities/elector.entity';
import type { ElectorRepository } from 'src/modules/electors/domain/repositories/elector.repository.interface';
import type { ElectorMfaChallengeRepository } from 'src/modules/auth/domain/repositories/elector-mfa-challenge.repository.interface';
import type { PasswordHasherPort } from 'src/modules/iam/application/ports/password-hasher.port';
import type { AsyncEmailServicePort } from 'src/modules/auth/application/ports/async-email-service.port';
import type { MfaHasherPort } from 'src/modules/auth/application/ports/mfa-hasher.port';
import type { OtpGeneratorPort } from 'src/modules/auth/application/ports/otp-generator.port';
import { LoginElectorUseCase } from './login-elector.use-case';

describe('LoginElectorUseCase', () => {
  const electors: jest.Mocked<ElectorRepository> = {
    create: jest.fn(),
    findByStudentCodeOrEmail: jest.fn(),
    findById: jest.fn(),
    softDelete: jest.fn(),
    updateStatus: jest.fn(),
    update: jest.fn(),
    findByEmail: jest.fn(),
    search: jest.fn(),
    findByStudentCodeAndProgramCode: jest.fn(),
    findElectionParticipation: jest.fn(),
  };
  const hasher: jest.Mocked<PasswordHasherPort> = {
    hash: jest.fn(),
    verify: jest.fn(),
  };
  const challenges: jest.Mocked<ElectorMfaChallengeRepository> = {
    create: jest.fn(),
    findBySessionId: jest.fn(),
    save: jest.fn(),
    deleteBySessionId: jest.fn(),
    invalidateByElectorId: jest.fn(),
  };
  const otpGenerator: jest.Mocked<OtpGeneratorPort> = {
    generate: jest.fn(),
  };
  const mfaHasher: jest.Mocked<MfaHasherPort> = {
    hash: jest.fn(),
    verify: jest.fn(),
  };
  const emailService: jest.Mocked<AsyncEmailServicePort> = {
    sendVerificationCode: jest.fn(),
    queueVerificationCode: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  function buildActiveElector(overrides: Partial<RestoreElectorInput> = {}): ElectorEntity {
    return ElectorEntity.restore({
      id: 'elector-1',
      firstName: 'Juan',
      lastName: 'Garcia',
      email: 'juan@example.com',
      passwordHash: 'pbkdf2$hashed-password',
      studentCode: '202012345',
      programCode: '2710',
      status: ElectorEntity.DEFAULT_STATUS,
      identification: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    });
  }

  function buildInactiveElector(): ElectorEntity {
    return buildActiveElector({ status: ElectorEntity.INACTIVE_STATUS });
  }

  const useCase = () =>
    new LoginElectorUseCase(electors, hasher, challenges, otpGenerator, mfaHasher, emailService);

  function expectLoginToSucceed() {
    electors.findByEmail.mockResolvedValue(buildActiveElector());
    hasher.verify.mockResolvedValue(true);
    otpGenerator.generate.mockReturnValue('483912');
    mfaHasher.hash.mockResolvedValue('sha256$hashed-otp');
    challenges.create.mockResolvedValue({} as never);
    emailService.queueVerificationCode.mockResolvedValue(undefined);
  }

  it('L1: returns mfaRequired with sessionId and no access token on valid credentials', async () => {
    expectLoginToSucceed();

    const result = await useCase().execute({ email: 'juan@example.com', password: 'secret' });

    expect(result).toMatchObject({
      mfaRequired: true,
      expiresIn: 300,
      message: 'A verification code has been sent to your registered email.',
    });
    expect(result.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result).not.toHaveProperty('accessToken');
  });

  it('L2: stores the OTP hashed, never in plain text', async () => {
    expectLoginToSucceed();

    await useCase().execute({ email: 'juan@example.com', password: 'secret' });

    expect(mfaHasher.hash.mock.calls[0]).toEqual(['483912']);
    expect(challenges.create.mock.calls[0][0].otpHash).toBe('sha256$hashed-otp');
    expect(challenges.create.mock.calls[0][0].otpHash).not.toBe('483912');
  });

  it('L3: queues the generated six-digit code to the elector email', async () => {
    expectLoginToSucceed();

    await useCase().execute({ email: 'juan@example.com', password: 'secret' });

    expect(emailService.queueVerificationCode.mock.calls[0]).toEqual([
      'juan@example.com',
      '483912',
    ]);
    expect('483912').toMatch(/^\d{6}$/);
  });

  it('L4: invalidates previous challenges before creating a new one', async () => {
    expectLoginToSucceed();

    await useCase().execute({ email: 'juan@example.com', password: 'secret' });

    expect(challenges.invalidateByElectorId.mock.calls[0]).toEqual(['elector-1']);
    expect(challenges.create.mock.calls.length).toBe(1);
  });

  it('L5: persists a five-minute TTL and resend cooldown', async () => {
    expectLoginToSucceed();
    const before = Date.now();

    await useCase().execute({ email: 'juan@example.com', password: 'secret' });

    const created = challenges.create.mock.calls[0][0];
    expect(created.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 300_000 - 1000);
    expect(created.expiresAt.getTime()).toBeLessThanOrEqual(before + 300_000 + 1000);
    expect(created.resendAt!.getTime()).toBeGreaterThanOrEqual(before + 60_000 - 1000);
  });

  it('L6: rejects an unknown email without creating a challenge or sending email', async () => {
    electors.findByEmail.mockResolvedValue(null);

    await expect(
      useCase().execute({ email: 'unknown@example.com', password: 'secret' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(challenges.create.mock.calls.length).toBe(0);
    expect(emailService.queueVerificationCode.mock.calls.length).toBe(0);
  });

  it('L7: rejects a wrong password without generating an OTP', async () => {
    electors.findByEmail.mockResolvedValue(buildActiveElector());
    hasher.verify.mockResolvedValue(false);

    await expect(
      useCase().execute({ email: 'juan@example.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(challenges.create.mock.calls.length).toBe(0);
    expect(emailService.queueVerificationCode.mock.calls.length).toBe(0);
  });

  it('L8: produces identical error for unknown email and wrong password (no enumeration)', async () => {
    electors.findByEmail.mockResolvedValue(null);
    await expect(
      useCase().execute({ email: 'unknown@example.com', password: 'secret' }),
    ).rejects.toThrow('Invalid credentials.');

    electors.findByEmail.mockResolvedValue(buildActiveElector());
    hasher.verify.mockResolvedValue(false);
    await expect(
      useCase().execute({ email: 'juan@example.com', password: 'wrong' }),
    ).rejects.toThrow('Invalid credentials.');
  });

  it('L9: rejects an inactive elector without sending email', async () => {
    electors.findByEmail.mockResolvedValue(buildInactiveElector());

    await expect(
      useCase().execute({ email: 'juan@example.com', password: 'secret' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(emailService.queueVerificationCode.mock.calls.length).toBe(0);
    expect(challenges.create.mock.calls.length).toBe(0);
  });

  it('L10: keeps the session when email queueing fails', async () => {
    expectLoginToSucceed();
    emailService.queueVerificationCode.mockRejectedValue(new Error('smtp down'));

    const result = await useCase().execute({ email: 'juan@example.com', password: 'secret' });

    expect(result).toMatchObject({
      mfaRequired: true,
      message: 'A verification code has been sent to your registered email.',
    });
    expect(challenges.deleteBySessionId.mock.calls.length).toBe(0);
    expect(challenges.create.mock.calls.length).toBe(1);
  });

  it('L11: never includes the OTP in the email queueing failure log', async () => {
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      expectLoginToSucceed();
      emailService.queueVerificationCode.mockRejectedValue(new Error('smtp down'));

      await useCase().execute({ email: 'juan@example.com', password: 'secret' });

      const logged = JSON.stringify(loggerError.mock.calls);
      expect(logged).not.toContain('483912');
    } finally {
      loggerError.mockRestore();
    }
  });

  it('L12: does not sign any token after rework', async () => {
    expectLoginToSucceed();

    const result = await useCase().execute({ email: 'juan@example.com', password: 'secret' });

    expect(result).not.toHaveProperty('accessToken');
  });

  it('L13: propagates repository errors without swallowing', async () => {
    electors.findByEmail.mockRejectedValue(new Error('db down'));

    await expect(
      useCase().execute({ email: 'juan@example.com', password: 'secret' }),
    ).rejects.toThrow('db down');
  });

  it('L14: locks the exact response shape (mfaRequired, sessionId, expiresIn, message)', async () => {
    expectLoginToSucceed();

    const result = await useCase().execute({ email: 'juan@example.com', password: 'secret' });

    expect(Object.keys(result).sort()).toEqual([
      'expiresIn',
      'message',
      'mfaRequired',
      'sessionId',
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        mfaRequired: true,
        expiresIn: 300,
        message: 'A verification code has been sent to your registered email.',
      }),
    );
  });

  it('L15: runs invalidateByElectorId, create and queueVerificationCode in that order', async () => {
    expectLoginToSucceed();

    await useCase().execute({ email: 'juan@example.com', password: 'secret' });

    const invalidateOrder = challenges.invalidateByElectorId.mock.invocationCallOrder[0];
    const createOrder = challenges.create.mock.invocationCallOrder[0];
    const queueOrder = emailService.queueVerificationCode.mock.invocationCallOrder[0];

    expect(invalidateOrder).toBeLessThan(createOrder);
    expect(createOrder).toBeLessThan(queueOrder);
  });
});
