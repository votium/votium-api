import { EmailDeliveryException } from 'src/shared/exceptions/base/email-delivery.exception';
import { UnauthorizedException } from 'src/shared/exceptions/base/unauthorized.exception';
import {
  ElectorEntity,
  type RestoreElectorInput,
} from 'src/modules/electors/domain/entities/elector.entity';
import type { ElectorRepository } from 'src/modules/electors/domain/repositories/elector.repository.interface';
import type { ElectorMfaChallengeRepository } from 'src/modules/electors/domain/repositories/elector-mfa-challenge.repository.interface';
import type { PasswordHasherPort } from 'src/modules/iam/application/ports/password-hasher.port';
import type { EmailServicePort } from 'src/modules/auth/application/ports/email-service.port';
import type { OtpGeneratorPort } from 'src/modules/auth/application/ports/otp-generator.port';
import { LoginElectorUseCase } from './login-elector.use-case';

describe('LoginElectorUseCase', () => {
  const electors: jest.Mocked<ElectorRepository> = {
    create: jest.fn(),
    findByStudentCodeOrEmail: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
    update: jest.fn(),
    findByEmail: jest.fn(),
    search: jest.fn(),
    findByStudentCodeAndProgramCode: jest.fn(),
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
  const emailService: jest.Mocked<EmailServicePort> = {
    sendVerificationCode: jest.fn(),
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
      createdAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    });
  }

  function buildInactiveElector(): ElectorEntity {
    return buildActiveElector({ status: ElectorEntity.INACTIVE_STATUS });
  }

  const useCase = () =>
    new LoginElectorUseCase(electors, hasher, challenges, otpGenerator, emailService);

  it('L1: returns mfaRequired with sessionId and no access token on valid credentials', async () => {
    electors.findByEmail.mockResolvedValue(buildActiveElector());
    hasher.verify.mockResolvedValue(true);
    otpGenerator.generate.mockReturnValue('483912');
    hasher.hash.mockResolvedValue('pbkdf2$hashed-otp');
    challenges.create.mockResolvedValue({} as never);
    emailService.sendVerificationCode.mockResolvedValue(undefined);

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
    electors.findByEmail.mockResolvedValue(buildActiveElector());
    hasher.verify.mockResolvedValue(true);
    otpGenerator.generate.mockReturnValue('483912');
    hasher.hash.mockResolvedValue('pbkdf2$hashed-otp');
    challenges.create.mockResolvedValue({} as never);
    emailService.sendVerificationCode.mockResolvedValue(undefined);

    await useCase().execute({ email: 'juan@example.com', password: 'secret' });

    expect(hasher.hash.mock.calls[0]).toEqual(['483912']);
    expect(challenges.create.mock.calls[0][0].otpHash).toBe('pbkdf2$hashed-otp');
    expect(challenges.create.mock.calls[0][0].otpHash).not.toBe('483912');
  });

  it('L3: sends the generated six-digit code to the elector email', async () => {
    electors.findByEmail.mockResolvedValue(buildActiveElector());
    hasher.verify.mockResolvedValue(true);
    otpGenerator.generate.mockReturnValue('483912');
    hasher.hash.mockResolvedValue('pbkdf2$hashed-otp');
    challenges.create.mockResolvedValue({} as never);
    emailService.sendVerificationCode.mockResolvedValue(undefined);

    await useCase().execute({ email: 'juan@example.com', password: 'secret' });

    expect(emailService.sendVerificationCode.mock.calls[0]).toEqual(['juan@example.com', '483912']);
    expect('483912').toMatch(/^\d{6}$/);
  });

  it('L4: invalidates previous challenges before creating a new one', async () => {
    electors.findByEmail.mockResolvedValue(buildActiveElector());
    hasher.verify.mockResolvedValue(true);
    otpGenerator.generate.mockReturnValue('483912');
    hasher.hash.mockResolvedValue('pbkdf2$hashed-otp');
    challenges.create.mockResolvedValue({} as never);
    emailService.sendVerificationCode.mockResolvedValue(undefined);

    await useCase().execute({ email: 'juan@example.com', password: 'secret' });

    expect(challenges.invalidateByElectorId.mock.calls[0]).toEqual(['elector-1']);
    expect(challenges.create.mock.calls.length).toBe(1);
  });

  it('L5: persists a five-minute TTL and resend cooldown', async () => {
    electors.findByEmail.mockResolvedValue(buildActiveElector());
    hasher.verify.mockResolvedValue(true);
    otpGenerator.generate.mockReturnValue('483912');
    hasher.hash.mockResolvedValue('pbkdf2$hashed-otp');
    challenges.create.mockResolvedValue({} as never);
    emailService.sendVerificationCode.mockResolvedValue(undefined);
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
    expect(emailService.sendVerificationCode.mock.calls.length).toBe(0);
  });

  it('L7: rejects a wrong password without generating an OTP', async () => {
    electors.findByEmail.mockResolvedValue(buildActiveElector());
    hasher.verify.mockResolvedValue(false);

    await expect(
      useCase().execute({ email: 'juan@example.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(challenges.create.mock.calls.length).toBe(0);
    expect(emailService.sendVerificationCode.mock.calls.length).toBe(0);
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
    expect(emailService.sendVerificationCode.mock.calls.length).toBe(0);
    expect(challenges.create.mock.calls.length).toBe(0);
  });

  it('L10: throws EmailDeliveryException and destroys the session when email fails', async () => {
    electors.findByEmail.mockResolvedValue(buildActiveElector());
    hasher.verify.mockResolvedValue(true);
    otpGenerator.generate.mockReturnValue('483912');
    hasher.hash.mockResolvedValue('pbkdf2$hashed-otp');
    challenges.create.mockResolvedValue({
      id: 'challenge-1',
      electorId: 'elector-1',
      sessionId: 'session-1',
      otpHash: 'pbkdf2$hashed-otp',
      attempts: 0,
      expiresAt: new Date(Date.now() + 300_000),
      resendAt: new Date(Date.now() + 60_000),
      consumedAt: null,
      createdAt: new Date(),
    } as never);
    emailService.sendVerificationCode.mockRejectedValue(new Error('smtp down'));

    await expect(
      useCase().execute({ email: 'juan@example.com', password: 'secret' }),
    ).rejects.toBeInstanceOf(EmailDeliveryException);
    expect(challenges.deleteBySessionId.mock.calls[0]).toEqual(['session-1']);
  });

  it('L11: never includes the OTP in the email failure error', async () => {
    electors.findByEmail.mockResolvedValue(buildActiveElector());
    hasher.verify.mockResolvedValue(true);
    otpGenerator.generate.mockReturnValue('483912');
    hasher.hash.mockResolvedValue('pbkdf2$hashed-otp');
    challenges.create.mockResolvedValue({
      id: 'challenge-1',
      sessionId: 'session-1',
    } as never);
    emailService.sendVerificationCode.mockRejectedValue(new Error('smtp down'));

    const error = await useCase()
      .execute({ email: 'juan@example.com', password: 'secret' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(EmailDeliveryException);
    expect((error as Error).message).not.toContain('483912');
  });

  it('L12: does not sign any token after rework', async () => {
    electors.findByEmail.mockResolvedValue(buildActiveElector());
    hasher.verify.mockResolvedValue(true);
    otpGenerator.generate.mockReturnValue('483912');
    hasher.hash.mockResolvedValue('pbkdf2$hashed-otp');
    challenges.create.mockResolvedValue({} as never);
    emailService.sendVerificationCode.mockResolvedValue(undefined);

    const result = await useCase().execute({ email: 'juan@example.com', password: 'secret' });

    expect(result).not.toHaveProperty('accessToken');
  });

  it('L13: propagates repository errors without swallowing', async () => {
    electors.findByEmail.mockRejectedValue(new Error('db down'));

    await expect(
      useCase().execute({ email: 'juan@example.com', password: 'secret' }),
    ).rejects.toThrow('db down');
  });
});
