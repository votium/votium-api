import { UnauthorizedException } from 'src/shared/exceptions/base/unauthorized.exception';
import { NotFoundException } from 'src/shared/exceptions/base/not-found.exception';
import {
  ElectorEntity,
  type RestoreElectorInput,
} from 'src/modules/electors/domain/entities/elector.entity';
import type { ElectorRepository } from 'src/modules/electors/domain/repositories/elector.repository.interface';
import type { PasswordHasherPort } from 'src/modules/iam/application/ports/password-hasher.port';
import type { TokenServicePort } from 'src/modules/auth/application/ports/token-service.port';
import { envs } from 'src/config';
import { LoginElectorDirectUseCase } from './login-elector-direct.use-case';

describe('LoginElectorDirectUseCase', () => {
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
    findByElection: jest.fn(),
    findElectionParticipation: jest.fn(),
  };
  const hasher: jest.Mocked<PasswordHasherPort> = {
    hash: jest.fn(),
    verify: jest.fn(),
  };
  const tokens = {
    signAccessToken: jest.fn(),
  } as unknown as jest.Mocked<TokenServicePort>;

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
      identification: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    });
  }

  const useCase = (enabled = true) =>
    new LoginElectorDirectUseCase(electors, hasher, tokens, enabled);

  it('D1: signs an elector access token on valid credentials', async () => {
    electors.findByEmail.mockResolvedValue(buildActiveElector());
    hasher.verify.mockResolvedValue(true);
    tokens.signAccessToken.mockResolvedValue('signed-jwt');

    const result = await useCase().execute({ email: 'juan@example.com', password: 'secret' });

    expect(result).toEqual({ accessToken: 'signed-jwt', expiresIn: envs.jwtExpiresIn });
    expect(tokens.signAccessToken.mock.calls[0][0]).toEqual({
      sub: 'elector-1',
      email: 'juan@example.com',
      actorType: 'ELECTOR',
    });
  });

  it('D2: rejects an unknown email with a generic 401', async () => {
    electors.findByEmail.mockResolvedValue(null);

    await expect(
      useCase().execute({ email: 'unknown@example.com', password: 'secret' }),
    ).rejects.toThrow(new UnauthorizedException('Invalid credentials.'));
    expect(tokens.signAccessToken.mock.calls.length).toBe(0);
  });

  it('D3: rejects an inactive elector with a generic 401', async () => {
    electors.findByEmail.mockResolvedValue(
      buildActiveElector({ status: ElectorEntity.INACTIVE_STATUS }),
    );
    hasher.verify.mockResolvedValue(true);

    await expect(
      useCase().execute({ email: 'juan@example.com', password: 'secret' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.signAccessToken.mock.calls.length).toBe(0);
  });

  it('D4: rejects a wrong password with a generic 401', async () => {
    electors.findByEmail.mockResolvedValue(buildActiveElector());
    hasher.verify.mockResolvedValue(false);

    await expect(
      useCase().execute({ email: 'juan@example.com', password: 'wrong' }),
    ).rejects.toThrow('Invalid credentials.');
    expect(tokens.signAccessToken.mock.calls.length).toBe(0);
  });

  it('D5: responds 404 without querying the repository when the flag is disabled', async () => {
    await expect(
      useCase(false).execute({ email: 'juan@example.com', password: 'secret' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(electors.findByEmail.mock.calls.length).toBe(0);
    expect(hasher.verify.mock.calls.length).toBe(0);
  });
});
