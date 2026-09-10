import { EmailDeliveryException } from 'src/shared/exceptions/base/email-delivery.exception';
import { ForbiddenException } from 'src/shared/exceptions/base/forbidden.exception';
import { TooManyRequestsException } from 'src/shared/exceptions/base/too-many-requests.exception';
import { UnauthorizedException } from 'src/shared/exceptions/base/unauthorized.exception';
import {
  ElectorEntity,
  type RestoreElectorInput,
} from 'src/modules/electors/domain/entities/elector.entity';
import { ElectorMfaChallengeEntity } from 'src/modules/electors/domain/entities/elector-mfa-challenge.entity';
import type { ElectorRepository } from 'src/modules/electors/domain/repositories/elector.repository.interface';
import type { ElectorMfaChallengeRepository } from 'src/modules/electors/domain/repositories/elector-mfa-challenge.repository.interface';
import type { PasswordHasherPort } from 'src/modules/iam/application/ports/password-hasher.port';
import type { EmailServicePort } from 'src/modules/auth/application/ports/email-service.port';
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
    updateStatus: jest.fn(),
    update: jest.fn(),
    findByEmail: jest.fn(),
    search: jest.fn(),
    findByStudentCodeAndProgramCode: jest.fn(),
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

  beforeEach(() => jest.clearAllMocks());

  function buildChallenge(
    overrides: Partial<ElectorMfaChallengeEntity> = {},
  ): ElectorMfaChallengeEntity {
    const now = Date.now();
    return new ElectorMfaChallengeEntity(
      'challenge-1',
      'elector-1',
      'session-1',
      'pbkdf2$hashed-otp',
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
      createdAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    });
  }

  const useCase = () =>
    new ResendElectorMfaUseCase(challenges, electors, otpGenerator, hasher, emailService);

  it('R1: sends a new code and returns a confirmation message', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    electors.findById.mockResolvedValue(buildElector());
    otpGenerator.generate.mockReturnValue('918273');
    hasher.hash.mockResolvedValue('pbkdf2$new-hash');
    emailService.sendVerificationCode.mockResolvedValue(undefined);

    const result = await useCase().execute({ sessionId: 'session-1' });

    expect(result).toMatchObject({ message: 'A new verification code has been sent.' });
    expect(emailService.sendVerificationCode.mock.calls[0]).toEqual(['juan@example.com', '918273']);
    expect(challenges.save.mock.calls[0][0]).toEqual(
      expect.objectContaining({ otpHash: 'pbkdf2$new-hash' }),
    );
  });

  it('R2: rotates the stored OTP (never sends the same code)', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    electors.findById.mockResolvedValue(buildElector());
    otpGenerator.generate.mockReturnValue('918273');
    hasher.hash.mockResolvedValue('pbkdf2$new-hash');
    emailService.sendVerificationCode.mockResolvedValue(undefined);

    await useCase().execute({ sessionId: 'session-1' });

    expect(challenges.save.mock.calls[0][0].otpHash).toBe('pbkdf2$new-hash');
    expect(challenges.save.mock.calls[0][0].otpHash).not.toBe('pbkdf2$hashed-otp');
    expect('918273').toMatch(/^\d{6}$/);
  });

  it('R3: rejects an unknown session with UnauthorizedException and sends no email', async () => {
    challenges.findBySessionId.mockResolvedValue(null);

    await expect(useCase().execute({ sessionId: 'missing' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(emailService.sendVerificationCode.mock.calls.length).toBe(0);
  });

  it('R4: rejects a consumed session with UnauthorizedException', async () => {
    challenges.findBySessionId.mockResolvedValue(
      buildChallenge({ consumedAt: new Date('2026-07-31T10:02:00.000Z') }),
    );

    await expect(useCase().execute({ sessionId: 'session-1' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(emailService.sendVerificationCode.mock.calls.length).toBe(0);
  });

  it('R5: rejects an inactive elector with ForbiddenException and sends no email', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    electors.findById.mockResolvedValue(buildElector({ status: ElectorEntity.INACTIVE_STATUS }));

    await expect(useCase().execute({ sessionId: 'session-1' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(emailService.sendVerificationCode.mock.calls.length).toBe(0);
  });

  it('R6: enforces the 60s cooldown with TooManyRequestsException', async () => {
    challenges.findBySessionId.mockResolvedValue(
      buildChallenge({ resendAt: new Date(Date.now() + 30_000) }),
    );
    electors.findById.mockResolvedValue(buildElector());

    await expect(useCase().execute({ sessionId: 'session-1' })).rejects.toBeInstanceOf(
      TooManyRequestsException,
    );
    expect(emailService.sendVerificationCode.mock.calls.length).toBe(0);
  });

  it('R7: allows resend right at the cooldown boundary', async () => {
    challenges.findBySessionId.mockResolvedValue(
      buildChallenge({ resendAt: new Date(Date.now() - 1000) }),
    );
    electors.findById.mockResolvedValue(buildElector());
    otpGenerator.generate.mockReturnValue('918273');
    hasher.hash.mockResolvedValue('pbkdf2$new-hash');
    emailService.sendVerificationCode.mockResolvedValue(undefined);

    await expect(useCase().execute({ sessionId: 'session-1' })).resolves.toMatchObject({
      message: 'A new verification code has been sent.',
    });
    expect(emailService.sendVerificationCode.mock.calls.length).toBe(1);
  });

  it('R8: destroys the session and throws EmailDeliveryException when email fails', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    electors.findById.mockResolvedValue(buildElector());
    otpGenerator.generate.mockReturnValue('918273');
    hasher.hash.mockResolvedValue('pbkdf2$new-hash');
    emailService.sendVerificationCode.mockRejectedValue(new Error('smtp down'));

    await expect(useCase().execute({ sessionId: 'session-1' })).rejects.toBeInstanceOf(
      EmailDeliveryException,
    );
    expect(challenges.deleteBySessionId.mock.calls[0]).toEqual(['session-1']);
  });

  it('R9: never leaks the OTP in the error on email failure', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    electors.findById.mockResolvedValue(buildElector());
    otpGenerator.generate.mockReturnValue('918273');
    hasher.hash.mockResolvedValue('pbkdf2$new-hash');
    emailService.sendVerificationCode.mockRejectedValue(new Error('boom'));

    const error = await useCase()
      .execute({ sessionId: 'session-1' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(EmailDeliveryException);
    expect((error as Error).message).not.toContain('918273');
  });

  it('R10: returns only a message and no sensitive data', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    electors.findById.mockResolvedValue(buildElector());
    otpGenerator.generate.mockReturnValue('918273');
    hasher.hash.mockResolvedValue('pbkdf2$new-hash');
    emailService.sendVerificationCode.mockResolvedValue(undefined);

    const result = await useCase().execute({ sessionId: 'session-1' });

    expect(result).toEqual({ message: 'A new verification code has been sent.' });
    expect(JSON.stringify(result)).not.toContain('918273');
    expect(JSON.stringify(result)).not.toContain('passwordHash');
  });
});
