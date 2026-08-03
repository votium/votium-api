import { EmailDeliveryException } from 'src/shared/exceptions/base/email-delivery.exception';
import { ForbiddenException } from 'src/shared/exceptions/base/forbidden.exception';
import { TooManyRequestsException } from 'src/shared/exceptions/base/too-many-requests.exception';
import { UnauthorizedException } from 'src/shared/exceptions/base/unauthorized.exception';
import { UserEntity } from 'src/modules/iam/domain/entities/user.entity';
import { RoleName } from 'src/modules/iam/domain/value-objects/role-name.vo';
import { UserStatus } from 'src/modules/iam/domain/value-objects/user-status.vo';
import type { UserRepository } from 'src/modules/iam/domain/repositories/user.repository.interface';
import type { PasswordHasherPort } from 'src/modules/iam/application/ports/password-hasher.port';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { MfaChallengeEntity } from 'src/modules/auth/domain/entities/mfa-challenge.entity';
import type { MfaChallengeRepository } from 'src/modules/auth/domain/repositories/mfa-challenge.repository.interface';
import type { EmailServicePort } from '../ports/email-service.port';
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
  const hasher: jest.Mocked<PasswordHasherPort> = {
    hash: jest.fn(),
    verify: jest.fn(),
  };
  const emailService: jest.Mocked<EmailServicePort> = {
    sendVerificationCode: jest.fn(),
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
      'pbkdf2$old-otp',
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
    new ResendMfaUseCase(challenges, users, otpGenerator, hasher, emailService, audit);

  it('rotates the OTP, resets attempts and sends the new code', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    users.findById.mockResolvedValue(buildUser(UserStatus.ACTIVE));
    otpGenerator.generate.mockReturnValue('654321');
    hasher.hash.mockResolvedValue('pbkdf2$new-otp');
    emailService.sendVerificationCode.mockResolvedValue(undefined);

    const result = await useCase().execute({ sessionId: 'session-1' });

    expect(result).toEqual({ message: 'A new verification code has been sent.' });
    const saved = challenges.save.mock.calls[0][0];
    expect(saved.otpHash).toBe('pbkdf2$new-otp');
    expect(saved.otpHash).not.toBe('pbkdf2$old-otp');
    expect(saved.attempts).toBe(0);
    expect(saved.consumedAt).toBeNull();
    expect(emailService.sendVerificationCode.mock.calls[0]).toEqual([
      'admin@example.com',
      '654321',
    ]);
    expect(audit.log.mock.calls[0][0]).toBe('MFA_RESEND');
  });

  it('renews the expiry and resend cooldown on resend', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    users.findById.mockResolvedValue(buildUser(UserStatus.ACTIVE));
    otpGenerator.generate.mockReturnValue('654321');
    hasher.hash.mockResolvedValue('pbkdf2$new-otp');
    emailService.sendVerificationCode.mockResolvedValue(undefined);
    const before = Date.now();

    await useCase().execute({ sessionId: 'session-1' });

    const saved = challenges.save.mock.calls[0][0];
    expect(saved.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 300_000 - 1000);
    expect(saved.resendAt!.getTime()).toBeGreaterThanOrEqual(before + 60_000 - 1000);
  });

  it('allows resend exactly at the cooldown boundary', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-31T10:00:00.000Z'));
    challenges.findBySessionId.mockResolvedValue(
      buildChallenge({ resendAt: new Date('2026-07-31T10:00:00.000Z') }),
    );
    users.findById.mockResolvedValue(buildUser(UserStatus.ACTIVE));
    otpGenerator.generate.mockReturnValue('654321');
    hasher.hash.mockResolvedValue('pbkdf2$new-otp');
    emailService.sendVerificationCode.mockResolvedValue(undefined);

    await expect(useCase().execute({ sessionId: 'session-1' })).resolves.toBeDefined();
    jest.useRealTimers();
  });

  it('rejects an unknown session with UnauthorizedException', async () => {
    challenges.findBySessionId.mockResolvedValue(null);

    await expect(useCase().execute({ sessionId: 'missing' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(emailService.sendVerificationCode.mock.calls.length).toBe(0);
  });

  it('rejects a consumed session and does not reactivate it', async () => {
    challenges.findBySessionId.mockResolvedValue(
      buildChallenge({ consumedAt: new Date(Date.now() - 10_000) }),
    );

    await expect(useCase().execute({ sessionId: 'session-1' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(challenges.save.mock.calls.length).toBe(0);
    expect(emailService.sendVerificationCode.mock.calls.length).toBe(0);
  });

  it('rejects a disabled user with ForbiddenException', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    users.findById.mockResolvedValue(buildUser(UserStatus.DISABLED));

    await expect(useCase().execute({ sessionId: 'session-1' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(emailService.sendVerificationCode.mock.calls.length).toBe(0);
  });

  it('rejects a resend within the cooldown with TooManyRequestsException', async () => {
    challenges.findBySessionId.mockResolvedValue(
      buildChallenge({ resendAt: new Date(Date.now() + 30_000) }),
    );
    users.findById.mockResolvedValue(buildUser(UserStatus.ACTIVE));

    await expect(useCase().execute({ sessionId: 'session-1' })).rejects.toBeInstanceOf(
      TooManyRequestsException,
    );
    expect(emailService.sendVerificationCode.mock.calls.length).toBe(0);
    expect(challenges.save.mock.calls.length).toBe(0);
  });

  it('throws EmailDeliveryException and destroys the session when email fails', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    users.findById.mockResolvedValue(buildUser(UserStatus.ACTIVE));
    otpGenerator.generate.mockReturnValue('654321');
    hasher.hash.mockResolvedValue('pbkdf2$new-otp');
    emailService.sendVerificationCode.mockRejectedValue(new Error('smtp down'));

    await expect(useCase().execute({ sessionId: 'session-1' })).rejects.toBeInstanceOf(
      EmailDeliveryException,
    );
    expect(challenges.deleteBySessionId.mock.calls[0]).toEqual(['session-1']);
  });

  it('never includes the OTP in the email failure error', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    users.findById.mockResolvedValue(buildUser(UserStatus.ACTIVE));
    otpGenerator.generate.mockReturnValue('654321');
    hasher.hash.mockResolvedValue('pbkdf2$new-otp');
    emailService.sendVerificationCode.mockRejectedValue(new Error('smtp down'));

    const error = await useCase()
      .execute({ sessionId: 'session-1' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(EmailDeliveryException);
    expect((error as Error).message).not.toContain('654321');
  });
});
