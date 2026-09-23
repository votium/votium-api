import { Logger } from '@nestjs/common';
import { ForbiddenException } from 'src/shared/exceptions/base/forbidden.exception';
import { TooManyRequestsException } from 'src/shared/exceptions/base/too-many-requests.exception';
import { UnauthorizedException } from 'src/shared/exceptions/base/unauthorized.exception';
import {
  ElectorEntity,
  type RestoreElectorInput,
} from 'src/modules/electors/domain/entities/elector.entity';
import { ElectorMfaChallengeEntity } from 'src/modules/auth/domain/entities/elector-mfa-challenge.entity';
import type { ElectorRepository } from 'src/modules/electors/domain/repositories/elector.repository.interface';
import type { ElectorMfaChallengeRepository } from 'src/modules/auth/domain/repositories/elector-mfa-challenge.repository.interface';
import type { AsyncEmailServicePort } from 'src/modules/auth/application/ports/async-email-service.port';
import type { MfaHasherPort } from 'src/modules/auth/application/ports/mfa-hasher.port';
import type { OtpGeneratorPort } from 'src/modules/auth/application/ports/otp-generator.port';
import { ResendElectorMfaUseCase } from './resend-elector-mfa.use-case';

describe('ResendElectorMfaUseCase', () => {
  const challenges: jest.Mocked<ElectorMfaChallengeRepository> = {
    create: jest.fn(),
    findBySessionId: jest.fn(),
    save: jest.fn(),
    deleteBySessionId: jest.fn(),
    invalidateByElectorId: jest.fn(),
  };
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

  function buildChallenge(
    overrides: Partial<ElectorMfaChallengeEntity> = {},
  ): ElectorMfaChallengeEntity {
    const now = Date.now();
    return new ElectorMfaChallengeEntity(
      'challenge-1',
      'elector-1',
      'session-1',
      'old-otp-hash',
      overrides.attempts ?? 0,
      overrides.expiresAt ?? new Date(now + 300_000),
      overrides.resendAt ?? new Date(now - 60_000),
      overrides.consumedAt ?? null,
      new Date(now),
    );
  }

  function buildElector(overrides: Partial<RestoreElectorInput> = {}): ElectorEntity {
    return ElectorEntity.restore({
      id: 'elector-1',
      firstName: 'Juan',
      lastName: 'Garcia',
      email: 'juan@example.com',
      passwordHash: 'hash',
      studentCode: '202012345',
      programCode: '2710',
      status: ElectorEntity.DEFAULT_STATUS,
      identification: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    });
  }

  const useCase = () =>
    new ResendElectorMfaUseCase(challenges, electors, otpGenerator, mfaHasher, emailService);

  function expectResendToSucceed() {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    electors.findById.mockResolvedValue(buildElector());
    otpGenerator.generate.mockReturnValue('918273');
    mfaHasher.hash.mockResolvedValue('sha256$new-hash');
    emailService.queueVerificationCode.mockResolvedValue(undefined);
  }

  it('R1: sends a new code and returns a confirmation message', async () => {
    expectResendToSucceed();

    const result = await useCase().execute({ sessionId: 'session-1' });

    expect(result).toMatchObject({ message: 'A new verification code has been sent.' });
    expect(emailService.queueVerificationCode.mock.calls[0]).toEqual([
      'juan@example.com',
      '918273',
    ]);
    expect(challenges.save.mock.calls[0][0]).toEqual(
      expect.objectContaining({ otpHash: 'sha256$new-hash' }),
    );
  });

  it('R2: rotates the stored OTP (never sends the same code)', async () => {
    expectResendToSucceed();

    await useCase().execute({ sessionId: 'session-1' });

    expect(challenges.save.mock.calls[0][0].otpHash).toBe('sha256$new-hash');
    expect(challenges.save.mock.calls[0][0].otpHash).not.toBe('old-otp-hash');
    expect('918273').toMatch(/^\d{6}$/);
    expect(mfaHasher.hash.mock.calls[0]).toEqual(['918273']);
  });

  it('R2b: persists the rotated challenge before queueing the email', async () => {
    expectResendToSucceed();

    await useCase().execute({ sessionId: 'session-1' });

    expect(challenges.save.mock.invocationCallOrder[0]).toBeLessThan(
      emailService.queueVerificationCode.mock.invocationCallOrder[0],
    );
  });

  it('R3: rejects an unknown session with UnauthorizedException and sends no email', async () => {
    challenges.findBySessionId.mockResolvedValue(null);

    await expect(useCase().execute({ sessionId: 'missing' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(emailService.queueVerificationCode.mock.calls.length).toBe(0);
  });

  it('R4: rejects a consumed session with UnauthorizedException', async () => {
    challenges.findBySessionId.mockResolvedValue(
      buildChallenge({ consumedAt: new Date('2026-07-31T10:02:00.000Z') }),
    );

    await expect(useCase().execute({ sessionId: 'session-1' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(emailService.queueVerificationCode.mock.calls.length).toBe(0);
  });

  it('R5: rejects an inactive elector with ForbiddenException and sends no email', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    electors.findById.mockResolvedValue(buildElector({ status: ElectorEntity.INACTIVE_STATUS }));

    await expect(useCase().execute({ sessionId: 'session-1' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(emailService.queueVerificationCode.mock.calls.length).toBe(0);
  });

  it('R6: enforces the 60s cooldown with TooManyRequestsException', async () => {
    challenges.findBySessionId.mockResolvedValue(
      buildChallenge({ resendAt: new Date(Date.now() + 30_000) }),
    );
    electors.findById.mockResolvedValue(buildElector());

    await expect(useCase().execute({ sessionId: 'session-1' })).rejects.toBeInstanceOf(
      TooManyRequestsException,
    );
    expect(emailService.queueVerificationCode.mock.calls.length).toBe(0);
  });

  it('R7: allows resend right at the cooldown boundary', async () => {
    challenges.findBySessionId.mockResolvedValue(
      buildChallenge({ resendAt: new Date(Date.now() - 1000) }),
    );
    electors.findById.mockResolvedValue(buildElector());
    otpGenerator.generate.mockReturnValue('918273');
    mfaHasher.hash.mockResolvedValue('sha256$new-hash');
    emailService.queueVerificationCode.mockResolvedValue(undefined);

    await expect(useCase().execute({ sessionId: 'session-1' })).resolves.toMatchObject({
      message: 'A new verification code has been sent.',
    });
    expect(emailService.queueVerificationCode.mock.calls.length).toBe(1);
  });

  it('R8: keeps the session when email queueing fails', async () => {
    expectResendToSucceed();
    emailService.queueVerificationCode.mockRejectedValue(new Error('smtp down'));

    const result = await useCase().execute({ sessionId: 'session-1' });

    expect(result).toMatchObject({ message: 'A new verification code has been sent.' });
    expect(challenges.deleteBySessionId.mock.calls.length).toBe(0);
    expect(challenges.save.mock.calls.length).toBe(1);
  });

  it('R9: never leaks the OTP in the queueing failure log', async () => {
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      expectResendToSucceed();
      emailService.queueVerificationCode.mockRejectedValue(new Error('boom'));

      await useCase().execute({ sessionId: 'session-1' });

      const logged = JSON.stringify(loggerError.mock.calls);
      expect(logged).not.toContain('918273');
    } finally {
      loggerError.mockRestore();
    }
  });

  it('R10: returns only a message and no sensitive data', async () => {
    expectResendToSucceed();

    const result = await useCase().execute({ sessionId: 'session-1' });

    expect(result).toEqual({ message: 'A new verification code has been sent.' });
    expect(JSON.stringify(result)).not.toContain('918273');
    expect(JSON.stringify(result)).not.toContain('passwordHash');
  });
});
