import { ElectionEntity } from 'src/modules/elections/domain/entities/election.entity';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type {
  CandidacyRepository,
  CandidacyWithCandidate,
} from '../../domain/repositories/candidacy.repository.interface';
import { GetElectionCandidaciesUseCase } from './get-election-candidacies.use-case';

function buildElection(): ElectionEntity {
  return ElectionEntity.restore({
    id: 'election-1',
    name: 'Student Council Election 2026',
    description: 'Election for the 2026 student council.',
    startDate: new Date(Date.UTC(2026, 9, 1)),
    startTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
    endDate: new Date(Date.UTC(2026, 9, 1)),
    endTime: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
    currentStatus: 'CREATED',
    blankVoteEnabled: false,
    createdAt: new Date('2026-08-19T15:00:00.000Z'),
  });
}

function buildCandidacy(overrides: Partial<CandidacyWithCandidate> = {}): CandidacyWithCandidate {
  return {
    id: 'candidacy-1',
    electionId: 'election-1',
    candidateId: 'candidate-1',
    candidateFirstName: 'Juan',
    candidateLastName: 'Garcia',
    positionNumber: 1,
    imageUrl: null,
    createdAt: new Date('2026-08-19T15:00:00.000Z'),
    ...overrides,
  };
}

describe('GetElectionCandidaciesUseCase', () => {
  const elections: jest.Mocked<ElectionRepository> = {
    findAll: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    findStatusHistory: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    hasCandidates: jest.fn(),
    hasVotes: jest.fn(),
    hasElectoralRoll: jest.fn(),
    findExpiredActive: jest.fn(),
    delete: jest.fn(),
  };

  const candidacies: jest.Mocked<CandidacyRepository> = {
    findUsedPositions: jest.fn(),
    create: jest.fn(),
    findByElection: jest.fn(),
    findPaginatedByElection: jest.fn(),
    findById: jest.fn(),
    findByCandidate: jest.fn(),
    update: jest.fn(),
    deleteByElectionAndCandidacyId: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    elections.findById.mockResolvedValue(buildElection());
    candidacies.findPaginatedByElection.mockResolvedValue({
      candidacies: [buildCandidacy()],
      total: 1,
    });
  });

  it('U-01: forwards page, limit and candidateName and returns the paginated result', async () => {
    const result = await new GetElectionCandidaciesUseCase(elections, candidacies).execute({
      electionId: 'election-1',
      page: 2,
      limit: 5,
    });

    expect(candidacies.findPaginatedByElection.mock.calls).toStrictEqual([
      ['election-1', { page: 2, limit: 5, candidateName: undefined }],
    ]);
    expect(result).toEqual({
      candidacies: [expect.objectContaining({ id: 'candidacy-1' })],
      total: 1,
    });
  });

  it('U-02: forwards the candidateName filter verbatim to the repository', async () => {
    await new GetElectionCandidaciesUseCase(elections, candidacies).execute({
      electionId: 'election-1',
      page: 1,
      limit: 10,
      candidateName: 'Juan',
    });

    expect(candidacies.findPaginatedByElection.mock.calls).toStrictEqual([
      ['election-1', { page: 1, limit: 10, candidateName: 'Juan' }],
    ]);
  });

  it('U-03: forwards an empty-string candidateName as-is for repository-side handling', async () => {
    await new GetElectionCandidaciesUseCase(elections, candidacies).execute({
      electionId: 'election-1',
      page: 1,
      limit: 10,
      candidateName: '',
    });

    expect(candidacies.findPaginatedByElection.mock.calls).toStrictEqual([
      ['election-1', { page: 1, limit: 10, candidateName: '' }],
    ]);
  });

  it('U-04: returns the repository rows and total unreshaped', async () => {
    const rows = [buildCandidacy(), buildCandidacy({ id: 'candidacy-2', positionNumber: 2 })];
    candidacies.findPaginatedByElection.mockResolvedValue({ candidacies: rows, total: 7 });

    const result = await new GetElectionCandidaciesUseCase(elections, candidacies).execute({
      electionId: 'election-1',
      page: 1,
      limit: 10,
    });

    expect(result.candidacies).toBe(rows);
    expect(result.total).toBe(7);
  });

  it('U-05: returns an empty page with a zero total when the election has no candidacies', async () => {
    candidacies.findPaginatedByElection.mockResolvedValue({ candidacies: [], total: 0 });

    const result = await new GetElectionCandidaciesUseCase(elections, candidacies).execute({
      electionId: 'election-1',
      page: 1,
      limit: 10,
    });

    expect(result).toEqual({ candidacies: [], total: 0 });
  });

  it('U-06: throws ElectionNotFoundError and never queries candidacies for a nonexistent election', async () => {
    elections.findById.mockResolvedValue(null);

    await expect(
      new GetElectionCandidaciesUseCase(elections, candidacies).execute({
        electionId: 'election-1',
        page: 1,
        limit: 10,
      }),
    ).rejects.toBeInstanceOf(ElectionNotFoundError);
    expect(candidacies.findPaginatedByElection.mock.calls).toHaveLength(0);
  });

  it('U-07: propagates an unexpected repository failure unchanged', async () => {
    candidacies.findPaginatedByElection.mockRejectedValue(new Error('database exploded'));

    await expect(
      new GetElectionCandidaciesUseCase(elections, candidacies).execute({
        electionId: 'election-1',
        page: 1,
        limit: 10,
      }),
    ).rejects.toThrow('database exploded');
  });
});
