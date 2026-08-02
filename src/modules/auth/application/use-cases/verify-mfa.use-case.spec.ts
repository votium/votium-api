import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';
import { ForbiddenException } from 'src/shared/exceptions/base/forbidden.exception';
import { GoneException } from 'src/shared/exceptions/base/gone.exception';
import { UnauthorizedException } from 'src/shared/exceptions/base/unauthorized.exception';
import { UserEntity } from 'src/modules/iam/domain/entities/user.entity';
import { RoleName } from 'src/modules/iam/domain/value-objects/role-name.vo';
import { UserStatus } from 'src/modules/iam/domain/value-objects/user-status.vo';
import type { UserRepository } from 'src/modules/iam/domain/repositories/user.repository.interface';
import type { PasswordHasherPort } from 'src/modules/iam/application/ports/password-hasher.port';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { MfaChallengeEntity } from 'src/modules/auth/domain/entities/mfa-challenge.entity';
import type { MfaChallengeRepository } from 'src/modules/auth/domain/repositories/mfa-challenge.repository.interface';
import type { TokenServicePort } from '../ports/token-service.port';
import { VerifyMfaUseCase } from './verify-mfa.use-case';

describe('VerifyMfaUseCase', () => {
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
  const hasher: jest.Mocked<PasswordHasherPort> = {
    hash: jest.fn(),
    verify: jest.fn(),
  };
  const tokens: jest.Mocked<TokenServicePort> = {
    signAccessToken: jest.fn(),
    verifyAccessToken: jest.fn(),
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
      'pbkdf2$hashed-otp',
      overrides.attempts ?? 0,
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

  const useCase = () => new VerifyMfaUseCase(challenges, users, hasher, tokens, audit);

  it('returns tokens on a correct code and consumes the challenge', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    hasher.verify.mockResolvedValue(true);
    users.findById.mockResolvedValue(buildUser(UserStatus.ACTIVE));
    tokens.signAccessToken.mockResolvedValue('access-token');

    const result = await useCase().execute({ sessionId: 'session-1', code: '483912' });

    expect(result).toMatchObject({ accessToken: 'access-token' });
    expect(result.expiresIn).toBe(3600);
    expect(challenges.save.mock.calls[0][0].consumedAt).toBeInstanceOf(Date);
    expect(audit.log.mock.calls[0][0]).toBe('MFA_VERIFY_SUCCESS');
  });

  it('signs tokens with the user identity', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    hasher.verify.mockResolvedValue(true);
    users.findById.mockResolvedValue(buildUser(UserStatus.ACTIVE));

    await useCase().execute({ sessionId: 'session-1', code: '483912' });

    expect(tokens.signAccessToken.mock.calls[0][0]).toEqual({
      sub: 'user-1',
      email: 'admin@example.com',
      role: 'ADMINISTRATOR',
    });
  });

  it('succeeds on the last allowed attempt without deleting the session', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge({ attempts: 4 }));
    hasher.verify.mockResolvedValue(true);
    users.findById.mockResolvedValue(buildUser(UserStatus.ACTIVE));

    await useCase().execute({ sessionId: 'session-1', code: '483912' });

    expect(challenges.deleteBySessionId.mock.calls.length).toBe(0);
    expect(challenges.save.mock.calls.length).toBeGreaterThan(0);
  });

  it('rejects an unknown session with UnauthorizedException', async () => {
    challenges.findBySessionId.mockResolvedValue(null);

    await expect(
      useCase().execute({ sessionId: 'missing', code: '483912' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(challenges.save.mock.calls.length).toBe(0);
    expect(tokens.signAccessToken.mock.calls.length).toBe(0);
  });

  it('rejects an already-used code with BadRequestException', async () => {
    challenges.findBySessionId.mockResolvedValue(
      buildChallenge({ consumedAt: new Date('2026-07-31T10:02:00.000Z') }),
    );

    await expect(
      useCase().execute({ sessionId: 'session-1', code: '483912' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tokens.signAccessToken.mock.calls.length).toBe(0);
  });

  it('rejects an expired code with GoneException', async () => {
    challenges.findBySessionId.mockResolvedValue(
      buildChallenge({ expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(
      useCase().execute({ sessionId: 'session-1', code: '483912' }),
    ).rejects.toBeInstanceOf(GoneException);
    expect(tokens.signAccessToken.mock.calls.length).toBe(0);
  });

  it('destroys the session when attempts are already exhausted', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge({ attempts: 5 }));

    await expect(useCase().execute({ sessionId: 'session-1', code: '483912' })).rejects.toThrow(
      'Maximum verification attempts exceeded.',
    );
    expect(challenges.deleteBySessionId.mock.calls[0]).toEqual(['session-1']);
  });

  it('increments attempts on a wrong code and rejects', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    hasher.verify.mockResolvedValue(false);

    await expect(
      useCase().execute({ sessionId: 'session-1', code: '000000' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(challenges.save.mock.calls[0][0]).toEqual(expect.objectContaining({ attempts: 1 }));
    expect(audit.log.mock.calls[0][0]).toBe('MFA_VERIFY_FAILED');
  });

  it('destroys the session on the fifth wrong attempt', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge({ attempts: 4 }));
    hasher.verify.mockResolvedValue(false);

    await expect(useCase().execute({ sessionId: 'session-1', code: '000000' })).rejects.toThrow(
      'Maximum verification attempts exceeded.',
    );
    expect(challenges.deleteBySessionId.mock.calls[0]).toEqual(['session-1']);
    expect(challenges.save.mock.calls.length).toBe(0);
  });

  it('rejects a deleted user with ForbiddenException and issues no tokens', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    hasher.verify.mockResolvedValue(true);
    users.findById.mockResolvedValue(null);

    await expect(
      useCase().execute({ sessionId: 'session-1', code: '483912' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tokens.signAccessToken.mock.calls.length).toBe(0);
  });

  it('rejects a disabled user at verify time with ForbiddenException', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    hasher.verify.mockResolvedValue(true);
    users.findById.mockResolvedValue(buildUser(UserStatus.DISABLED));

    await expect(
      useCase().execute({ sessionId: 'session-1', code: '483912' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tokens.signAccessToken.mock.calls.length).toBe(0);
  });
});
