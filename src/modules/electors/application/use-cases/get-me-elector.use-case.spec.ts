import { ElectorEntity } from '../../domain/entities/elector.entity';
import { ElectorNotFoundError } from '../../domain/errors/elector-not-found.error';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';
import { GetMeElectorUseCase } from './get-me-elector.use-case';

describe('GetMeElectorUseCase', () => {
  const electors: jest.Mocked<ElectorRepository> = {
    create: jest.fn(),
    findByStudentCodeOrEmail: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
    findByEmail: jest.fn(),
    search: jest.fn(),
    findByStudentCodeAndProgramCode: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('returns the elector when found, resolving exclusively from the sub', async () => {
    electors.findById.mockResolvedValue(
      ElectorEntity.restore({
        id: 'elector-1',
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@example.com',
        passwordHash: 'hash',
        studentCode: 'E1234',
        programCode: '2710',
        status: 'ACTIVE',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      }),
    );
    const useCase = new GetMeElectorUseCase(electors);

    await expect(useCase.execute('elector-1')).resolves.toBeInstanceOf(ElectorEntity);
    expect(electors.findById.mock.calls).toEqual([['elector-1']]);
  });

  it('throws ElectorNotFoundError when the elector does not exist', async () => {
    electors.findById.mockResolvedValue(null);
    const useCase = new GetMeElectorUseCase(electors);

    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(ElectorNotFoundError);
  });
});
