import { CandidateEntity } from '../../domain/entities/candidate.entity';
import type { CandidateRepository } from '../../domain/repositories/candidate.repository.interface';
import { SearchCandidatesUseCase } from './search-candidates.use-case';

function buildCandidate(id: string): CandidateEntity {
  return CandidateEntity.restore({
    id,
    firstName: 'Juan',
    lastName: 'Garcia',
    studentCode: '202012345',
    programCode: '1234',
    identificationNumber: '1000000000',
    status: 'ACTIVE',
    createdAt: new Date('2026-08-19T15:00:00.000Z'),
    companionFirstName: null,
    companionLastName: null,
    companionStudentCode: null,
    companionProgramCode: null,
    companionIdentification: null,
  });
}

describe('SearchCandidatesUseCase', () => {
  const candidates: jest.Mocked<CandidateRepository> = {
    create: jest.fn(),
    search: jest.fn().mockResolvedValue({ candidates: [], total: 0 }),
    findById: jest.fn(),
    softDelete: jest.fn(),
    updateStatus: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('U1: forwards all provided filters and paging to the repository', async () => {
    const useCase = new SearchCandidatesUseCase(candidates);

    await useCase.execute({
      page: 2,
      limit: 25,
      firstName: 'Juan',
      lastName: 'Garcia',
      name: 'Juan',
      programCode: '1234',
      studentCode: 'C-1',
      identificationNumber: 'ID-1',
      status: 'ACTIVE',
    });

    expect(candidates.search.mock.calls).toHaveLength(1);
    expect(candidates.search.mock.calls[0][0]).toEqual({
      page: 2,
      limit: 25,
      firstName: 'Juan',
      lastName: 'Garcia',
      name: 'Juan',
      programCode: '1234',
      studentCode: 'C-1',
      identificationNumber: 'ID-1',
      status: 'ACTIVE',
    });
  });

  it('U2: defaults page and limit to 1 and 10 when they are missing', async () => {
    const useCase = new SearchCandidatesUseCase(candidates);

    await useCase.execute({ firstName: 'Juan' });

    expect(candidates.search.mock.calls).toHaveLength(1);
    expect(candidates.search.mock.calls[0][0]).toEqual({
      firstName: 'Juan',
      page: 1,
      limit: 10,
    });
  });

  it('U3: normalizes non-positive page and limit to their defaults', async () => {
    const useCase = new SearchCandidatesUseCase(candidates);

    await useCase.execute({ page: 0, limit: -5 });

    expect(candidates.search.mock.calls[0][0]).toEqual({ page: 1, limit: 10 });
  });

  it('U4: normalizes NaN page and limit to their defaults', async () => {
    const useCase = new SearchCandidatesUseCase(candidates);

    await useCase.execute({ page: NaN, limit: NaN });

    expect(candidates.search.mock.calls[0][0]).toEqual({ page: 1, limit: 10 });
  });

  it('U5: keeps valid page and limit intact', async () => {
    const useCase = new SearchCandidatesUseCase(candidates);

    await useCase.execute({ page: 3, limit: 50 });

    expect(candidates.search.mock.calls[0][0]).toEqual({ page: 3, limit: 50 });
  });

  it('U6: forwards the name filter as-is (the repository owns normalization)', async () => {
    const useCase = new SearchCandidatesUseCase(candidates);

    await useCase.execute({ page: 1, limit: 10, name: '  bruno ' });

    expect(candidates.search.mock.calls[0][0]).toEqual({ page: 1, limit: 10, name: '  bruno ' });
  });

  it('U7: forwards status as-is (ACTIVE/INACTIVE/undefined)', async () => {
    const useCase = new SearchCandidatesUseCase(candidates);

    for (const status of ['ACTIVE', 'INACTIVE', undefined] as const) {
      await useCase.execute({ page: 1, limit: 10, status });
    }

    expect(candidates.search.mock.calls).toHaveLength(3);
    expect(candidates.search.mock.calls[0][0]).toMatchObject({ status: 'ACTIVE' });
    expect(candidates.search.mock.calls[1][0]).toMatchObject({ status: 'INACTIVE' });
    expect(candidates.search.mock.calls[2][0]).toMatchObject({ status: undefined });
  });

  it('U8: returns the repository result unchanged', async () => {
    const results = { candidates: [buildCandidate('candidate-1')], total: 1 };
    candidates.search.mockResolvedValue(results);

    const useCase = new SearchCandidatesUseCase(candidates);

    const result = await useCase.execute({ page: 1, limit: 10 });

    expect(result).toBe(results);
  });

  it('U9: returns an empty result when the repository finds no matches', async () => {
    candidates.search.mockResolvedValue({ candidates: [], total: 0 });

    const useCase = new SearchCandidatesUseCase(candidates);

    await expect(useCase.execute({ firstName: 'nobody' })).resolves.toEqual({
      candidates: [],
      total: 0,
    });
  });

  it('U10: propagates repository failures unchanged', async () => {
    candidates.search.mockRejectedValue(new Error('database exploded'));

    const useCase = new SearchCandidatesUseCase(candidates);

    await expect(useCase.execute({})).rejects.toThrow('database exploded');
  });
});
