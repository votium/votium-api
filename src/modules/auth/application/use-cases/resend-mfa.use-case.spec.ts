import { Logger } from '@nestjs/common';
import { ForbiddenException } from 'src/shared/exceptions/base/forbidden.exception';
import { TooManyRequestsException } from 'src/shared/exceptions/base/too-many-requests.exception';
import { UnauthorizedException } from 'src/shared/exceptions/base/unauthorized.exception';
import { UserEntity } from 'src/modules/iam/domain/entities/user.entity';
import { RoleName } from 'src/modules/iam/domain/value-objects/role-name.vo';
import { UserStatus } from 'src/modules/iam/domain/value-objects/user-status.vo';
import type { UserRepository } from 'src/modules/iam/domain/repositories/user.repository.interface';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { MfaChallengeEntity } from 'src/modules/auth/domain/entities/mfa-challenge.entity';
import type { MfaChallengeRepository } from 'src/modules/auth/domain/repositories/mfa-challenge.repository.interface';
import type { AsyncEmailServicePort } from '../ports/async-email-service.port';
import type { MfaHasherPort } from '../ports/mfa-hasher.port';
import type { OtpGeneratorPort } from '../ports/otp-generator.port';
import { ResendMfaUseCase } from './resend-mfa.use-case';

describe('ResendMfaUseCase', () => {
  const challenges: jest.Mocked<MfaChallengeRepository> = {
    create: jest.fn(),
    findBySessionId: jest.fn(),
    save: jest.fn(),
    deleteBySessionId: jest.fn(),
    invalidateByUserId: jest.fn(),
  };
  const users: jest.Mocked<UserRepository> = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    save: jest.fn(),
    findAll: jest.fn(),
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
  const audit: jest.Mocked<Pick<AuditLogPort, 'log'>> = {
    log: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  function buildChallenge(overrides: Partial<MfaChallengeEntity> = {}): MfaChallengeEntity {
    const now = Date.now();
    return new MfaChallengeEntity(
      'challenge-1',
      'user-1',
      'session-1',
      'old-otp-hash',
      3,
      overrides.expiresAt ?? new Date(now + 300_000),
      overrides.resendAt ?? new Date(now - 60_000),
      overrides.consumedAt ?? null,
      new Date(now),
    );
  }

  function buildUser(status: UserStatus): UserEntity {
    return UserEntity.restore({
      id: 'user-1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'admin@example.com',
      passwordHash: 'hash',
      role: RoleName.ADMINISTRATOR,
      roleId: 'role-1',
      status,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
  }

  const useCase = () =>
    new ResendMfaUseCase(challenges, users, otpGenerator, mfaHasher, emailService, audit);

  function expectResendToSucceed() {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    users.findById.mockResolvedValue(buildUser(UserStatus.ACTIVE));
    otpGenerator.generate.mockReturnValue('654321');
    mfaHasher.hash.mockResolvedValue('sha256$new-otp');
    challenges.save.mockResolvedValue({} as never);
    emailService.queueVerificationCode.mockResolvedValue(undefined);
  }

  it('rotates the OTP, resets attempts and queues the new code', async () => {
    expectResendToSucceed();

    const result = await useCase().execute({ sessionId: 'session-1' });

    expect(result).toEqual({ message: 'A new verification code has been sent.' });
    const saved = challenges.save.mock.calls[0][0];
    expect(saved.otpHash).toBe('sha256$new-otp');
    expect(saved.otpHash).not.toBe('old-otp-hash');
    expect(saved.attempts).toBe(0);
    expect(saved.consumedAt).toBeNull();
    expect(emailService.queueVerificationCode.mock.calls[0]).toEqual([
      'admin@example.com',
      '654321',
    ]);
    expect(audit.log.mock.calls[0][0]).toBe('MFA_RESEND');
  });

  it('renews the expiry and resend cooldown on resend', async () => {
    expectResendToSucceed();
    const before = Date.now();

    await useCase().execute({ sessionId: 'session-1' });

    const saved = challenges.save.mock.calls[0][0];
    expect(saved.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 300_000 - 1000);
    expect(saved.resendAt!.getTime()).toBeGreaterThanOrEqual(before + 60_000 - 1000);
  });

  it('persists the rotated challenge before queueing the email and auditing', async () => {
    expectResendToSucceed();

    await useCase().execute({ sessionId: 'session-1' });

    expect(challenges.save.mock.invocationCallOrder[0]).toBeLessThan(
      emailService.queueVerificationCode.mock.invocationCallOrder[0],
    );
    expect(emailService.queueVerificationCode.mock.invocationCallOrder[0]).toBeLessThan(
      audit.log.mock.invocationCallOrder[0],
    );
  });

  it('allows resend exactly at the cooldown boundary', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-31T10:00:00.000Z'));
    challenges.findBySessionId.mockResolvedValue(
      buildChallenge({ resendAt: new Date('2026-07-31T10:00:00.000Z') }),
    );
    users.findById.mockResolvedValue(buildUser(UserStatus.ACTIVE));
    otpGenerator.generate.mockReturnValue('654321');
    mfaHasher.hash.mockResolvedValue('sha256$new-otp');
    emailService.queueVerificationCode.mockResolvedValue(undefined);

    await expect(useCase().execute({ sessionId: 'session-1' })).resolves.toBeDefined();
    jest.useRealTimers();
  });

  it('rejects an unknown session with UnauthorizedException', async () => {
    challenges.findBySessionId.mockResolvedValue(null);

    await expect(useCase().execute({ sessionId: 'missing' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(emailService.queueVerificationCode.mock.calls.length).toBe(0);
  });

  it('rejects a consumed session and does not reactivate it', async () => {
    challenges.findBySessionId.mockResolvedValue(
      buildChallenge({ consumedAt: new Date(Date.now() - 10_000) }),
    );

    await expect(useCase().execute({ sessionId: 'session-1' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(challenges.save.mock.calls.length).toBe(0);
    expect(emailService.queueVerificationCode.mock.calls.length).toBe(0);
  });

  it('rejects a disabled user with ForbiddenException', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    users.findById.mockResolvedValue(buildUser(UserStatus.DISABLED));

    await expect(useCase().execute({ sessionId: 'session-1' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(emailService.queueVerificationCode.mock.calls.length).toBe(0);
  });

  it('rejects a resend within the cooldown with TooManyRequestsException', async () => {
    challenges.findBySessionId.mockResolvedValue(
      buildChallenge({ resendAt: new Date(Date.now() + 30_000) }),
    );
    users.findById.mockResolvedValue(buildUser(UserStatus.ACTIVE));

    await expect(useCase().execute({ sessionId: 'session-1' })).rejects.toBeInstanceOf(
      TooManyRequestsException,
    );
    expect(emailService.queueVerificationCode.mock.calls.length).toBe(0);
    expect(challenges.save.mock.calls.length).toBe(0);
  });

  it('does not queue email when challenge persistence fails', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    users.findById.mockResolvedValue(buildUser(UserStatus.ACTIVE));
    otpGenerator.generate.mockReturnValue('654321');
    mfaHasher.hash.mockResolvedValue('sha256$new-otp');
    challenges.save.mockRejectedValue(new Error('db down'));

    await expect(useCase().execute({ sessionId: 'session-1' })).rejects.toThrow('db down');
    expect(emailService.queueVerificationCode.mock.calls.length).toBe(0);
  });

  it('keeps the session when email queueing fails', async () => {
    expectResendToSucceed();
    emailService.queueVerificationCode.mockRejectedValue(new Error('smtp down'));

    const result = await useCase().execute({ sessionId: 'session-1' });

    expect(result).toEqual({ message: 'A new verification code has been sent.' });
    expect(challenges.deleteBySessionId.mock.calls.length).toBe(0);
    expect(challenges.save.mock.calls.length).toBe(1);
    expect(audit.log.mock.calls[0][0]).toBe('MFA_RESEND');
  });

  it('never includes the OTP in the email queueing failure log', async () => {
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      expectResendToSucceed();
      emailService.queueVerificationCode.mockRejectedValue(new Error('smtp down'));

      await useCase().execute({ sessionId: 'session-1' });

      const logged = JSON.stringify(loggerError.mock.calls);
      expect(logged).not.toContain('654321');
    } finally {
      loggerError.mockRestore();
    }
  });
});
