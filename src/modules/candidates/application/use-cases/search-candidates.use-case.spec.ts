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
  });
}

describe('SearchCandidatesUseCase', () => {
  const candidates: jest.Mocked<CandidateRepository> = {
    create: jest.fn(),
    search: jest.fn(),
    findById: jest.fn(),
    updateStatus: jest.fn(),
    update: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  it('forwards all provided filters to the repository', async () => {
    candidates.search.mockResolvedValue([]);

    const useCase = new SearchCandidatesUseCase(candidates);

    await useCase.execute({
      firstName: 'Juan',
      lastName: 'Garcia',
      studyPlanCode: '1234',
      studentCode: '202012345',
      identificationNumber: '1000000000',
    });

    expect(candidates.search.mock.calls).toHaveLength(1);
    expect(candidates.search.mock.calls[0][0]).toEqual({
      firstName: 'Juan',
      lastName: 'Garcia',
      studyPlanCode: '1234',
      studentCode: '202012345',
      identificationNumber: '1000000000',
    });
  });

  it('calls the repository with an empty params object when no filters are provided', async () => {
    candidates.search.mockResolvedValue([]);

    const useCase = new SearchCandidatesUseCase(candidates);

    await useCase.execute({});

    expect(candidates.search.mock.calls).toHaveLength(1);
    expect(candidates.search.mock.calls[0][0]).toEqual({});
  });

  it('does not trim or transform filter values (the repository owns normalization)', async () => {
    candidates.search.mockResolvedValue([]);

    const useCase = new SearchCandidatesUseCase(candidates);

    await useCase.execute({ firstName: '  Juan  ', studentCode: ' 123 ' });

    expect(candidates.search.mock.calls).toHaveLength(1);
    expect(candidates.search.mock.calls[0][0]).toEqual({
      firstName: '  Juan  ',
      studentCode: ' 123 ',
    });
  });

  it('returns the repository result unchanged', async () => {
    const results = [buildCandidate('candidate-1'), buildCandidate('candidate-2')];
    candidates.search.mockResolvedValue(results);

    const useCase = new SearchCandidatesUseCase(candidates);

    const result = await useCase.execute({});

    expect(result).toBe(results);
    expect(result).toHaveLength(2);
  });

  it('returns an empty array when the repository finds no matches', async () => {
    candidates.search.mockResolvedValue([]);

    const useCase = new SearchCandidatesUseCase(candidates);

    await expect(useCase.execute({ firstName: 'nobody' })).resolves.toEqual([]);
  });

  it('propagates repository failures unchanged', async () => {
    candidates.search.mockRejectedValue(new Error('database exploded'));

    const useCase = new SearchCandidatesUseCase(candidates);

    await expect(useCase.execute({})).rejects.toThrow('database exploded');
  });
});
