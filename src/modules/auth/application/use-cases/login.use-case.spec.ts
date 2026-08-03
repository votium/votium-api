import { EmailDeliveryException } from 'src/shared/exceptions/base/email-delivery.exception';
import { ForbiddenException } from 'src/shared/exceptions/base/forbidden.exception';
import { UnauthorizedException } from 'src/shared/exceptions/base/unauthorized.exception';
import { UserEntity } from 'src/modules/iam/domain/entities/user.entity';
import { RoleName } from 'src/modules/iam/domain/value-objects/role-name.vo';
import { UserStatus } from 'src/modules/iam/domain/value-objects/user-status.vo';
import type { UserRepository } from 'src/modules/iam/domain/repositories/user.repository.interface';
import type { PasswordHasherPort } from 'src/modules/iam/application/ports/password-hasher.port';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import type { MfaChallengeRepository } from 'src/modules/auth/domain/repositories/mfa-challenge.repository.interface';
import type { EmailServicePort } from '../ports/email-service.port';
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
  const emailService: jest.Mocked<EmailServicePort> = {
    sendVerificationCode: jest.fn(),
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
    new LoginUseCase(users, hasher, challenges, otpGenerator, emailService, audit);

  it('requires MFA for an active admin and returns the session', async () => {
    users.findByEmail.mockResolvedValue(buildUser(RoleName.ADMINISTRATOR, UserStatus.ACTIVE));
    hasher.verify.mockResolvedValue(true);
    otpGenerator.generate.mockReturnValue('483912');
    hasher.hash.mockResolvedValue('pbkdf2$hashed-otp');
    challenges.create.mockResolvedValue({} as never);
    emailService.sendVerificationCode.mockResolvedValue(undefined);

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
    hasher.hash.mockResolvedValue('pbkdf2$hashed-otp');
    challenges.create.mockResolvedValue({} as never);
    emailService.sendVerificationCode.mockResolvedValue(undefined);

    const result = await useCase().execute({ email: 'admin@example.com', password: 'Secret123!' });

    expect(result.mfaRequired).toBe(true);
  });

  it('stores the OTP hashed, never in plain text', async () => {
    users.findByEmail.mockResolvedValue(buildUser(RoleName.ADMINISTRATOR, UserStatus.ACTIVE));
    hasher.verify.mockResolvedValue(true);
    otpGenerator.generate.mockReturnValue('483912');
    hasher.hash.mockResolvedValue('pbkdf2$hashed-otp');
    emailService.sendVerificationCode.mockResolvedValue(undefined);

    await useCase().execute({ email: 'admin@example.com', password: 'Secret123!' });

    expect(hasher.hash.mock.calls[0]).toEqual(['483912']);
    expect(challenges.create.mock.calls[0][0].otpHash).toBe('pbkdf2$hashed-otp');
    expect(challenges.create.mock.calls[0][0].otpHash).not.toBe('483912');
  });

  it('sends the generated six-digit code to the registered email', async () => {
    users.findByEmail.mockResolvedValue(buildUser(RoleName.ADMINISTRATOR, UserStatus.ACTIVE));
    hasher.verify.mockResolvedValue(true);
    otpGenerator.generate.mockReturnValue('483912');
    hasher.hash.mockResolvedValue('pbkdf2$hashed-otp');
    emailService.sendVerificationCode.mockResolvedValue(undefined);

    await useCase().execute({ email: 'admin@example.com', password: 'Secret123!' });

    expect(emailService.sendVerificationCode.mock.calls[0]).toEqual([
      'admin@example.com',
      '483912',
    ]);
    expect('483912').toMatch(/^\d{6}$/);
  });

  it('invalidates previous challenges before creating a new one', async () => {
    users.findByEmail.mockResolvedValue(buildUser(RoleName.ADMINISTRATOR, UserStatus.ACTIVE));
    hasher.verify.mockResolvedValue(true);
    otpGenerator.generate.mockReturnValue('483912');
    hasher.hash.mockResolvedValue('pbkdf2$hashed-otp');
    emailService.sendVerificationCode.mockResolvedValue(undefined);

    await useCase().execute({ email: 'admin@example.com', password: 'Secret123!' });

    expect(challenges.invalidateByUserId.mock.calls[0]).toEqual(['user-1']);
    expect(challenges.create.mock.calls.length).toBe(1);
  });

  it('persists a five-minute TTL and resend cooldown', async () => {
    users.findByEmail.mockResolvedValue(buildUser(RoleName.ADMINISTRATOR, UserStatus.ACTIVE));
    hasher.verify.mockResolvedValue(true);
    otpGenerator.generate.mockReturnValue('483912');
    hasher.hash.mockResolvedValue('pbkdf2$hashed-otp');
    emailService.sendVerificationCode.mockResolvedValue(undefined);
    const before = Date.now();

    await useCase().execute({ email: 'admin@example.com', password: 'Secret123!' });

    const created = challenges.create.mock.calls[0][0];
    expect(created.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 300_000 - 1000);
    expect(created.expiresAt.getTime()).toBeLessThanOrEqual(before + 300_000 + 1000);
    expect(created.resendAt!.getTime()).toBeGreaterThanOrEqual(before + 60_000 - 1000);
  });

  it('logs the MFA_OTP_SENT audit event', async () => {
    users.findByEmail.mockResolvedValue(buildUser(RoleName.ADMINISTRATOR, UserStatus.ACTIVE));
    hasher.verify.mockResolvedValue(true);
    otpGenerator.generate.mockReturnValue('483912');
    hasher.hash.mockResolvedValue('pbkdf2$hashed-otp');
    emailService.sendVerificationCode.mockResolvedValue(undefined);

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

  it('rejects a disabled user with ForbiddenException and does not send email', async () => {
    users.findByEmail.mockResolvedValue(buildUser(RoleName.ADMINISTRATOR, UserStatus.DISABLED));

    await expect(
      useCase().execute({ email: 'admin@example.com', password: 'Secret123!' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(emailService.sendVerificationCode.mock.calls.length).toBe(0);
    expect(challenges.create.mock.calls.length).toBe(0);
  });

  it('throws EmailDeliveryException and destroys the session when email fails', async () => {
    users.findByEmail.mockResolvedValue(buildUser(RoleName.ADMINISTRATOR, UserStatus.ACTIVE));
    hasher.verify.mockResolvedValue(true);
    otpGenerator.generate.mockReturnValue('483912');
    hasher.hash.mockResolvedValue('pbkdf2$hashed-otp');
    emailService.sendVerificationCode.mockRejectedValue(new Error('smtp down'));

    await expect(
      useCase().execute({ email: 'admin@example.com', password: 'Secret123!' }),
    ).rejects.toBeInstanceOf(EmailDeliveryException);

    const sessionId = challenges.create.mock.calls[0][0].sessionId;
    expect(challenges.deleteBySessionId.mock.calls[0]).toEqual([sessionId]);
  });

  it('never includes the OTP in the email failure error', async () => {
    users.findByEmail.mockResolvedValue(buildUser(RoleName.ADMINISTRATOR, UserStatus.ACTIVE));
    hasher.verify.mockResolvedValue(true);
    otpGenerator.generate.mockReturnValue('483912');
    hasher.hash.mockResolvedValue('pbkdf2$hashed-otp');
    emailService.sendVerificationCode.mockRejectedValue(new Error('smtp down'));

    const error = await useCase()
      .execute({ email: 'admin@example.com', password: 'Secret123!' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(EmailDeliveryException);
    expect((error as Error).message).not.toContain('483912');
  });
});
