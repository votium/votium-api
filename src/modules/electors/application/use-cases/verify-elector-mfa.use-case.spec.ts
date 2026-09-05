import { envs } from 'src/config';
import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';
import { ForbiddenException } from 'src/shared/exceptions/base/forbidden.exception';
import { GoneException } from 'src/shared/exceptions/base/gone.exception';
import { UnauthorizedException } from 'src/shared/exceptions/base/unauthorized.exception';
import {
  ElectorEntity,
  type RestoreElectorInput,
} from 'src/modules/electors/domain/entities/elector.entity';
import { ElectorMfaChallengeEntity } from 'src/modules/electors/domain/entities/elector-mfa-challenge.entity';
import type { ElectorRepository } from 'src/modules/electors/domain/repositories/elector.repository.interface';
import type { ElectorMfaChallengeRepository } from 'src/modules/electors/domain/repositories/elector-mfa-challenge.repository.interface';
import type { PasswordHasherPort } from 'src/modules/iam/application/ports/password-hasher.port';
import type { TokenServicePort } from 'src/modules/auth/application/ports/token-service.port';
import { VerifyElectorMfaUseCase } from './verify-elector-mfa.use-case';

describe('VerifyElectorMfaUseCase', () => {
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
    findByEmail: jest.fn(),
    search: jest.fn(),
    findByStudentCodeAndProgramCode: jest.fn(),
  };
  const hasher: jest.Mocked<PasswordHasherPort> = {
    hash: jest.fn(),
    verify: jest.fn(),
  };
  const tokens: jest.Mocked<TokenServicePort> = {
    signAccessToken: jest.fn(),
    verifyAccessToken: jest.fn(),
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

  const useCase = () => new VerifyElectorMfaUseCase(challenges, electors, hasher, tokens);

  it('V1: returns tokens on a correct code and consumes the challenge', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    hasher.verify.mockResolvedValue(true);
    electors.findById.mockResolvedValue(buildElector());
    tokens.signAccessToken.mockResolvedValue('access-token');

    const result = await useCase().execute({ sessionId: 'session-1', code: '483912' });

    expect(result).toMatchObject({ accessToken: 'access-token' });
    expect(result.expiresIn).toBe(envs.jwtExpiresIn);
    expect(challenges.save.mock.calls[0][0].consumedAt).toBeInstanceOf(Date);
  });

  it('V2: signs the token with the elector identity and actorType ELECTOR', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    hasher.verify.mockResolvedValue(true);
    electors.findById.mockResolvedValue(buildElector());

    await useCase().execute({ sessionId: 'session-1', code: '483912' });

    expect(tokens.signAccessToken.mock.calls[0][0]).toEqual({
      sub: 'elector-1',
      email: 'juan@example.com',
      actorType: 'ELECTOR',
    });
    expect(tokens.signAccessToken.mock.calls[0][0]).not.toHaveProperty('role');
  });

  it('V3: succeeds on the last allowed attempt without deleting the session', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge({ attempts: 4 }));
    hasher.verify.mockResolvedValue(true);
    electors.findById.mockResolvedValue(buildElector());

    await useCase().execute({ sessionId: 'session-1', code: '483912' });

    expect(challenges.deleteBySessionId.mock.calls.length).toBe(0);
    expect(challenges.save.mock.calls.length).toBeGreaterThan(0);
  });

  it('V4: rejects an unknown session with UnauthorizedException', async () => {
    challenges.findBySessionId.mockResolvedValue(null);

    await expect(
      useCase().execute({ sessionId: 'missing', code: '483912' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(challenges.save.mock.calls.length).toBe(0);
    expect(tokens.signAccessToken.mock.calls.length).toBe(0);
  });

  it('V5: rejects an already-used code with BadRequestException', async () => {
    challenges.findBySessionId.mockResolvedValue(
      buildChallenge({ consumedAt: new Date('2026-07-31T10:02:00.000Z') }),
    );

    await expect(
      useCase().execute({ sessionId: 'session-1', code: '483912' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tokens.signAccessToken.mock.calls.length).toBe(0);
  });

  it('V6: rejects an expired code with GoneException', async () => {
    challenges.findBySessionId.mockResolvedValue(
      buildChallenge({ expiresAt: new Date(Date.now() - 1000) }),
    );

    await expect(
      useCase().execute({ sessionId: 'session-1', code: '483912' }),
    ).rejects.toBeInstanceOf(GoneException);
    expect(tokens.signAccessToken.mock.calls.length).toBe(0);
  });

  it('V7: destroys the session when attempts are already exhausted', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge({ attempts: 5 }));

    await expect(useCase().execute({ sessionId: 'session-1', code: '483912' })).rejects.toThrow(
      'Maximum verification attempts exceeded.',
    );
    expect(challenges.deleteBySessionId.mock.calls[0]).toEqual(['session-1']);
  });

  it('V8: increments attempts on a wrong code and rejects', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    hasher.verify.mockResolvedValue(false);

    await expect(
      useCase().execute({ sessionId: 'session-1', code: '000000' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(challenges.save.mock.calls[0][0]).toEqual(expect.objectContaining({ attempts: 1 }));
  });

  it('V9: destroys the session on the fifth wrong attempt', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge({ attempts: 4 }));
    hasher.verify.mockResolvedValue(false);

    await expect(useCase().execute({ sessionId: 'session-1', code: '000000' })).rejects.toThrow(
      'Maximum verification attempts exceeded.',
    );
    expect(challenges.deleteBySessionId.mock.calls[0]).toEqual(['session-1']);
    expect(challenges.save.mock.calls.length).toBe(0);
  });

  it('V10: rejects a deleted elector with ForbiddenException and issues no tokens', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    hasher.verify.mockResolvedValue(true);
    electors.findById.mockResolvedValue(null);

    await expect(
      useCase().execute({ sessionId: 'session-1', code: '483912' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tokens.signAccessToken.mock.calls.length).toBe(0);
  });

  it('V11: rejects an inactive elector at verify time with ForbiddenException', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    hasher.verify.mockResolvedValue(true);
    electors.findById.mockResolvedValue(buildElector({ status: ElectorEntity.INACTIVE_STATUS }));

    await expect(
      useCase().execute({ sessionId: 'session-1', code: '483912' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(tokens.signAccessToken.mock.calls.length).toBe(0);
  });

  it('V12: returns expiresIn from envs config (not hard-coded)', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    hasher.verify.mockResolvedValue(true);
    electors.findById.mockResolvedValue(buildElector());

    const result = await useCase().execute({ sessionId: 'session-1', code: '483912' });

    expect(result.expiresIn).toBe(envs.jwtExpiresIn);
  });

  it('V13: never returns the OTP or sensitive elector data', async () => {
    challenges.findBySessionId.mockResolvedValue(buildChallenge());
    hasher.verify.mockResolvedValue(true);
    electors.findById.mockResolvedValue(buildElector());
    tokens.signAccessToken.mockResolvedValue('access-token');

    const result = await useCase().execute({ sessionId: 'session-1', code: '483912' });

    expect(result).toEqual({ accessToken: 'access-token', expiresIn: envs.jwtExpiresIn });
    expect(JSON.stringify(result)).not.toContain('483912');
    expect(JSON.stringify(result)).not.toContain('passwordHash');
  });
});
