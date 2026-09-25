import { Logger } from '@nestjs/common';
import { ForbiddenException } from 'src/shared/exceptions/base/forbidden.exception';
import { UnauthorizedException } from 'src/shared/exceptions/base/unauthorized.exception';
import { UserEntity } from 'src/modules/iam/domain/entities/user.entity';
import { RoleName } from 'src/modules/iam/domain/value-objects/role-name.vo';
import { UserStatus } from 'src/modules/iam/domain/value-objects/user-status.vo';
import type { UserRepository } from 'src/modules/iam/domain/repositories/user.repository.interface';
import type { PasswordHasherPort } from 'src/modules/iam/application/ports/password-hasher.port';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import type { MfaChallengeRepository } from 'src/modules/auth/domain/repositories/mfa-challenge.repository.interface';
import type { AsyncEmailServicePort } from '../ports/async-email-service.port';
import type { MfaHasherPort } from '../ports/mfa-hasher.port';
import type { OtpGeneratorPort } from '../ports/otp-generator.port';
import { LoginUseCase } from './login.use-case';

describe('LoginUseCase', () => {
  const users: jest.Mocked<UserRepository> = {
    findById: jest.fn(),
    findByEmail: jest.fn(),
    save: jest.fn(),
    findAll: jest.fn(),
  };
  const hasher: jest.Mocked<PasswordHasherPort> = {
    hash: jest.fn(),
    verify: jest.fn(),
  };
  const challenges: jest.Mocked<MfaChallengeRepository> = {
    create: jest.fn(),
    findBySessionId: jest.fn(),
    save: jest.fn(),
    deleteBySessionId: jest.fn(),
    invalidateByUserId: jest.fn(),
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

  function buildUser(role: RoleName, status: UserStatus): UserEntity {
    return UserEntity.restore({
      id: 'user-1',
      firstName: 'John',
      lastName: 'Doe',
      email: 'admin@example.com',
      passwordHash: 'hash',
      role,
      roleId: 'role-1',
      status,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
  }

  const useCase = () =>
    new LoginUseCase(users, hasher, challenges, otpGenerator, mfaHasher, emailService, audit);

  function expectDefaultMocksToSucceed() {
    users.findByEmail.mockResolvedValue(buildUser(RoleName.ADMINISTRATOR, UserStatus.ACTIVE));
    hasher.verify.mockResolvedValue(true);
    otpGenerator.generate.mockReturnValue('483912');
    mfaHasher.hash.mockResolvedValue('sha256$hashed-otp');
    challenges.create.mockResolvedValue({} as never);
    emailService.queueVerificationCode.mockResolvedValue(undefined);
  }

  it('requires MFA for an active admin and returns the session', async () => {
    expectDefaultMocksToSucceed();

    const result = await useCase().execute({ email: 'admin@example.com', password: 'Secret123!' });

    expect(result).toMatchObject({
      mfaRequired: true,
      expiresIn: 300,
      message: 'A verification code has been sent to your registered email.',
    });
    expect(result.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result).not.toHaveProperty('accessToken');
  });

  it('requires MFA for an auditor as well', async () => {
    users.findByEmail.mockResolvedValue(buildUser(RoleName.AUDITOR, UserStatus.ACTIVE));
    hasher.verify.mockResolvedValue(true);
    otpGenerator.generate.mockReturnValue('123456');
    mfaHasher.hash.mockResolvedValue('sha256$hashed-otp');
    challenges.create.mockResolvedValue({} as never);
    emailService.queueVerificationCode.mockResolvedValue(undefined);

    const result = await useCase().execute({ email: 'admin@example.com', password: 'Secret123!' });

    expect(result.mfaRequired).toBe(true);
  });

  it('stores the OTP hashed, never in plain text', async () => {
    expectDefaultMocksToSucceed();

    await useCase().execute({ email: 'admin@example.com', password: 'Secret123!' });

    expect(mfaHasher.hash.mock.calls[0]).toEqual(['483912']);
    expect(challenges.create.mock.calls[0][0].otpHash).toBe('sha256$hashed-otp');
    expect(challenges.create.mock.calls[0][0].otpHash).not.toBe('483912');
  });

  it('queues the generated six-digit code to the registered email', async () => {
    expectDefaultMocksToSucceed();

    await useCase().execute({ email: 'admin@example.com', password: 'Secret123!' });

    expect(emailService.queueVerificationCode.mock.calls[0]).toEqual([
      'admin@example.com',
      '483912',
    ]);
    expect('483912').toMatch(/^\d{6}$/);
  });

  it('invalidates previous challenges before creating a new one', async () => {
    expectDefaultMocksToSucceed();

    await useCase().execute({ email: 'admin@example.com', password: 'Secret123!' });

    expect(challenges.invalidateByUserId.mock.calls[0]).toEqual(['user-1']);
    expect(challenges.create.mock.calls.length).toBe(1);
  });

  it('persists the challenge before queuing the email and auditing', async () => {
    expectDefaultMocksToSucceed();

    await useCase().execute({ email: 'admin@example.com', password: 'Secret123!' });

    expect(challenges.create.mock.invocationCallOrder[0]).toBeLessThan(
      emailService.queueVerificationCode.mock.invocationCallOrder[0],
    );
    expect(emailService.queueVerificationCode.mock.invocationCallOrder[0]).toBeLessThan(
      audit.log.mock.invocationCallOrder[0],
    );
  });

  it('persists a five-minute TTL and resend cooldown', async () => {
    expectDefaultMocksToSucceed();
    const before = Date.now();

    await useCase().execute({ email: 'admin@example.com', password: 'Secret123!' });

    const created = challenges.create.mock.calls[0][0];
    expect(created.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 300_000 - 1000);
    expect(created.expiresAt.getTime()).toBeLessThanOrEqual(before + 300_000 + 1000);
    expect(created.resendAt!.getTime()).toBeGreaterThanOrEqual(before + 60_000 - 1000);
  });

  it('logs the MFA_OTP_SENT audit event', async () => {
    expectDefaultMocksToSucceed();

    await useCase().execute({ email: 'admin@example.com', password: 'Secret123!' });

    expect(audit.log.mock.calls[0][0]).toBe('MFA_OTP_SENT');
    expect(audit.log.mock.calls[0][1]).toBe('user-1');
  });

  it('rejects an unknown email with UnauthorizedException', async () => {
    users.findByEmail.mockResolvedValue(null);

    await expect(
      useCase().execute({ email: 'ghost@example.com', password: 'Secret123!' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a wrong password with UnauthorizedException', async () => {
    users.findByEmail.mockResolvedValue(buildUser(RoleName.ADMINISTRATOR, UserStatus.ACTIVE));
    hasher.verify.mockResolvedValue(false);

    await expect(
      useCase().execute({ email: 'admin@example.com', password: 'WrongPass!' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not reveal whether the email exists', async () => {
    users.findByEmail.mockResolvedValue(null);
    await expect(
      useCase().execute({ email: 'ghost@example.com', password: 'Secret123!' }),
    ).rejects.toThrow('Invalid credentials.');

    users.findByEmail.mockResolvedValue(buildUser(RoleName.ADMINISTRATOR, UserStatus.ACTIVE));
    hasher.verify.mockResolvedValue(false);
    await expect(
      useCase().execute({ email: 'admin@example.com', password: 'WrongPass!' }),
    ).rejects.toThrow('Invalid credentials.');
  });

  it('rejects a disabled user with ForbiddenException and does not queue email', async () => {
    users.findByEmail.mockResolvedValue(buildUser(RoleName.ADMINISTRATOR, UserStatus.DISABLED));

    await expect(
      useCase().execute({ email: 'admin@example.com', password: 'Secret123!' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(emailService.queueVerificationCode.mock.calls.length).toBe(0);
    expect(challenges.create.mock.calls.length).toBe(0);
  });

  it('does not queue email when challenge persistence fails', async () => {
    users.findByEmail.mockResolvedValue(buildUser(RoleName.ADMINISTRATOR, UserStatus.ACTIVE));
    hasher.verify.mockResolvedValue(true);
    otpGenerator.generate.mockReturnValue('483912');
    mfaHasher.hash.mockResolvedValue('sha256$hashed-otp');
    challenges.create.mockRejectedValue(new Error('db down'));

    await expect(
      useCase().execute({ email: 'admin@example.com', password: 'Secret123!' }),
    ).rejects.toThrow('db down');
    expect(emailService.queueVerificationCode.mock.calls.length).toBe(0);
  });

  it('keeps the session when email queueing fails', async () => {
    expectDefaultMocksToSucceed();
    emailService.queueVerificationCode.mockRejectedValue(new Error('smtp down'));

    const result = await useCase().execute({ email: 'admin@example.com', password: 'Secret123!' });

    expect(result).toMatchObject({
      mfaRequired: true,
      message: 'A verification code has been sent to your registered email.',
    });
    expect(challenges.deleteBySessionId.mock.calls.length).toBe(0);
    expect(challenges.create.mock.calls.length).toBe(1);
    expect(audit.log.mock.calls[0][0]).toBe('MFA_OTP_SENT');
  });

  it('never includes the OTP in the email queueing failure log', async () => {
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      expectDefaultMocksToSucceed();
      emailService.queueVerificationCode.mockRejectedValue(new Error('smtp down'));

      await useCase().execute({ email: 'admin@example.com', password: 'Secret123!' });

      const logged = JSON.stringify(loggerError.mock.calls);
      expect(logged).not.toContain('483912');
    } finally {
      loggerError.mockRestore();
    }
  });
});
