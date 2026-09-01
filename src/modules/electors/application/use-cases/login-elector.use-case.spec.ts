import { envs } from 'src/config';
import { UnauthorizedException } from 'src/shared/exceptions/base/unauthorized.exception';
import {
  ElectorEntity,
  type RestoreElectorInput,
} from 'src/modules/electors/domain/entities/elector.entity';
import type { ElectorRepository } from 'src/modules/electors/domain/repositories/elector.repository.interface';
import type { PasswordHasherPort } from 'src/modules/iam/application/ports/password-hasher.port';
import type { TokenServicePort } from 'src/modules/auth/application/ports/token-service.port';
import { LoginElectorUseCase } from './login-elector.use-case';

describe('LoginElectorUseCase', () => {
  const electors: jest.Mocked<ElectorRepository> = {
    create: jest.fn(),
    findByStudentCodeOrEmail: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
    findByEmail: jest.fn(),
    search: jest.fn(),
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

  const useCase = () => new LoginElectorUseCase(electors, hasher, tokens);

  it('U1: returns { accessToken, expiresIn } on valid credentials', async () => {
    electors.findByEmail.mockResolvedValue(buildActiveElector());
    hasher.verify.mockResolvedValue(true);
    tokens.signAccessToken.mockResolvedValue('jwt-token');

    const result = await useCase().execute({ email: 'juan@example.com', password: 'secret' });

    expect(result).toEqual({ accessToken: 'jwt-token', expiresIn: envs.jwtExpiresIn });
  });

  it('U2: signs the JWT with minimal elector identity (no role, no sensitive data)', async () => {
    electors.findByEmail.mockResolvedValue(buildActiveElector());
    hasher.verify.mockResolvedValue(true);
    tokens.signAccessToken.mockResolvedValue('jwt-token');

    await useCase().execute({ email: 'juan@example.com', password: 'secret' });

    expect(tokens.signAccessToken.mock.calls[0][0]).toEqual({
      sub: 'elector-1',
      email: 'juan@example.com',
      actorType: 'ELECTOR',
    });
  });

  it('U3: returns 401 for unknown email without calling hash or sign', async () => {
    electors.findByEmail.mockResolvedValue(null);

    await expect(
      useCase().execute({ email: 'unknown@example.com', password: 'secret' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(hasher.verify.mock.calls).toHaveLength(0);
    expect(tokens.signAccessToken.mock.calls).toHaveLength(0);
  });

  it('U4: returns 401 for wrong password without signing', async () => {
    electors.findByEmail.mockResolvedValue(buildActiveElector());
    hasher.verify.mockResolvedValue(false);

    await expect(
      useCase().execute({ email: 'juan@example.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.signAccessToken.mock.calls).toHaveLength(0);
  });

  it('U5: produces identical error for unknown email and wrong password (no enumeration)', async () => {
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

  it('U6: rejects inactive elector', async () => {
    electors.findByEmail.mockResolvedValue(buildInactiveElector());

    await expect(
      useCase().execute({ email: 'juan@example.com', password: 'secret' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(hasher.verify.mock.calls).toHaveLength(0);
    expect(tokens.signAccessToken.mock.calls).toHaveLength(0);
  });

  it('U7: returns expiresIn from envs config (not hard-coded)', async () => {
    electors.findByEmail.mockResolvedValue(buildActiveElector());
    hasher.verify.mockResolvedValue(true);
    tokens.signAccessToken.mockResolvedValue('jwt-token');

    const result = await useCase().execute({ email: 'juan@example.com', password: 'secret' });

    expect(result.expiresIn).toBe(envs.jwtExpiresIn);
  });

  it('U8: propagates repository errors without swallowing', async () => {
    electors.findByEmail.mockRejectedValue(new Error('db down'));

    await expect(
      useCase().execute({ email: 'juan@example.com', password: 'secret' }),
    ).rejects.toThrow('db down');
  });

  it('U9: rejects an elector without an id without signing', async () => {
    electors.findByEmail.mockResolvedValue(
      ElectorEntity.create({
        firstName: 'Juan',
        lastName: 'Garcia',
        email: 'juan@example.com',
        passwordHash: 'pbkdf2$hashed-password',
        studentCode: '202012345',
        programCode: '2710',
      }),
    );
    hasher.verify.mockResolvedValue(true);

    await expect(
      useCase().execute({ email: 'juan@example.com', password: 'secret' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.signAccessToken.mock.calls).toHaveLength(0);
  });
});
