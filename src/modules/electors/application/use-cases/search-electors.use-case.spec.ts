import { ElectorEntity } from '../../domain/entities/elector.entity';
import type {
  ElectorRepository,
  ElectorSearchParams,
  ElectorSearchResult,
} from '../../domain/repositories/elector.repository.interface';
import { SearchElectorsUseCase } from './search-electors.use-case';

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
    updatedAt: null,
  });
}

describe('SearchElectorsUseCase', () => {
  const electors: jest.Mocked<ElectorRepository> = {
    create: jest.fn(),
    findByStudentCodeOrEmail: jest.fn(),
    findById: jest.fn(),
    softDelete: jest.fn(),
    updateStatus: jest.fn(),
    update: jest.fn(),
    findByEmail: jest.fn(),
    search: jest.fn().mockResolvedValue({ electors: [], total: 0 }),
    findByStudentCodeAndProgramCode: jest.fn(),
    findElectionParticipation: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('EUS-01: forwards the status filter to the repository', async () => {
    const useCase = new SearchElectorsUseCase(electors);

    await useCase.execute({ page: 1, limit: 10, status: 'INACTIVE' });

    expect(electors.search.mock.calls[0][0].status).toBe('INACTIVE');
  });

  it('EUS-02: forwards the identification filter to the repository', async () => {
    const useCase = new SearchElectorsUseCase(electors);

    await useCase.execute({ page: 1, limit: 10, identification: '001234' });

    expect(electors.search.mock.calls[0][0].identification).toBe('001234');
  });

  it('EUS-03: forwards existing filters and pagination unchanged', async () => {
    const useCase = new SearchElectorsUseCase(electors);

    const params: ElectorSearchParams = {
      page: 3,
      limit: 25,
      name: 'Juan',
      studentCode: '202012345',
      programCode: '2710',
    };

    await useCase.execute(params);

    expect(electors.search.mock.calls[0][0]).toEqual(params);
  });

  it('EUS-04: returns the repository result unchanged', async () => {
    const result: ElectorSearchResult = { electors: [buildElector('elector-1')], total: 1 };
    electors.search.mockResolvedValue(result);

    const useCase = new SearchElectorsUseCase(electors);

    await expect(useCase.execute({ page: 1, limit: 10 })).resolves.toBe(result);
  });

  it('EUS-05: omits status and identification keys when they are undefined', async () => {
    const useCase = new SearchElectorsUseCase(electors);

    await useCase.execute({ page: 1, limit: 10 });

    const arg = electors.search.mock.calls[0][0];
    expect(arg).not.toHaveProperty('status');
    expect(arg).not.toHaveProperty('identification');
  });
});
