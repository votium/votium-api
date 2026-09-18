import { ElectorEntity } from '../../domain/entities/elector.entity';
import { ElectorNotFoundError } from '../../domain/errors/elector-not-found.error';
import type {
  ElectorElectionParticipation,
  ElectorRepository,
} from '../../domain/repositories/elector.repository.interface';
import { GetElectorUseCase } from './get-elector.use-case';

function buildElector(id: string): ElectorEntity {
  return ElectorEntity.restore({
    id,
    firstName: 'Juan Camilo',
    lastName: 'Garcia Saenz',
    email: 'juan.garcia@correounivalle.edu.co',
    passwordHash: 'pbkdf2$210000$salt$hash',
    studentCode: '202012345',
    programCode: '2710',
    identification: '1001234567',
    status: 'ACTIVE',
    createdAt: new Date('2026-08-19T15:00:00.000Z'),
    updatedAt: new Date('2026-08-19T15:00:00.000Z'),
  });
}

function buildParticipation(
  overrides: Partial<ElectorElectionParticipation> = {},
): ElectorElectionParticipation {
  return {
    electionId: 'election-1',
    electionName: 'Consejo Superior',
    electionStatus: 'PENDING',
    hasVoted: true,
    ...overrides,
  };
}

describe('GetElectorUseCase', () => {
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
    findElectionParticipation: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('EUG-01: returns the elector and its election participation', async () => {
    const participation = [buildParticipation()];
    electors.findById.mockResolvedValue(buildElector('elector-1'));
    electors.findElectionParticipation.mockResolvedValue(participation);

    const useCase = new GetElectorUseCase(electors);

    const result = await useCase.execute('elector-1');

    expect(result.elector).toBeInstanceOf(ElectorEntity);
    expect(result.elector.id).toBe('elector-1');
    expect(result.participation).toBe(participation);
  });

  it('EUG-02: returns an empty participation array when the elector has none', async () => {
    electors.findById.mockResolvedValue(buildElector('elector-1'));
    electors.findElectionParticipation.mockResolvedValue([]);

    const useCase = new GetElectorUseCase(electors);

    const result = await useCase.execute('elector-1');

    expect(result.participation).toEqual([]);
  });

  it('EUG-03: throws ElectorNotFoundError when the elector does not exist and skips participation', async () => {
    electors.findById.mockResolvedValue(null);

    const useCase = new GetElectorUseCase(electors);

    await expect(useCase.execute('missing')).rejects.toBeInstanceOf(ElectorNotFoundError);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(electors.findElectionParticipation).not.toHaveBeenCalled();
  });

  it('EUG-04: queries both reads with the given id', async () => {
    electors.findById.mockResolvedValue(buildElector('elector-1'));
    electors.findElectionParticipation.mockResolvedValue([]);

    const useCase = new GetElectorUseCase(electors);

    await useCase.execute('elector-1');

    expect(electors.findById.mock.calls).toEqual([['elector-1']]);
    expect(electors.findElectionParticipation.mock.calls).toEqual([['elector-1']]);
  });

  it('EUG-05: propagates repository failures unchanged without calling participation', async () => {
    electors.findById.mockRejectedValue(new Error('database exploded'));

    const useCase = new GetElectorUseCase(electors);

    await expect(useCase.execute('elector-1')).rejects.toThrow('database exploded');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(electors.findElectionParticipation).not.toHaveBeenCalled();
  });
});
