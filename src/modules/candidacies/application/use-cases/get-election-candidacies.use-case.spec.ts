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
    update: jest.fn(),
    updateStatus: jest.fn(),
    hasCandidates: jest.fn(),
    hasVotes: jest.fn(),
    delete: jest.fn(),
  };

  const candidacies: jest.Mocked<CandidacyRepository> = {
    findMaxPosition: jest.fn(),
    create: jest.fn(),
    findByElection: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    elections.findById.mockResolvedValue(buildElection());
    candidacies.findByElection.mockResolvedValue([buildCandidacy()]);
  });

  it('U-01: returns the election name and all candidacies when no filters are provided', async () => {
    const result = await new GetElectionCandidaciesUseCase(elections, candidacies).execute({
      electionId: 'election-1',
    });

    expect(result).toEqual({
      electionName: 'Student Council Election 2026',
      candidacies: [expect.objectContaining({ id: 'candidacy-1' })],
    });
    expect(candidacies.findByElection.mock.calls).toStrictEqual([
      ['election-1', { candidateName: undefined }],
    ]);
  });

  it('U-02: the election name comes from the persisted election entity', async () => {
    const election = buildElection();
    elections.findById.mockResolvedValue(election);
    candidacies.findByElection.mockResolvedValue([]);

    const result = await new GetElectionCandidaciesUseCase(elections, candidacies).execute({
      electionId: 'election-1',
    });

    expect(result.electionName).toBe(election.name);
  });

  it('U-03: returns the candidacies returned by the repository without reshaping them', async () => {
    const rows = [buildCandidacy(), buildCandidacy({ id: 'candidacy-2', positionNumber: 2 })];
    candidacies.findByElection.mockResolvedValue(rows);

    const result = await new GetElectionCandidaciesUseCase(elections, candidacies).execute({
      electionId: 'election-1',
    });

    expect(result.candidacies).toBe(rows);
    expect(result.candidacies).toHaveLength(2);
  });

  it('U-04: forwards the candidateName filter verbatim to the repository', async () => {
    await new GetElectionCandidaciesUseCase(elections, candidacies).execute({
      electionId: 'election-1',
      candidateName: 'Juan',
    });

    expect(candidacies.findByElection.mock.calls).toStrictEqual([
      ['election-1', { candidateName: 'Juan' }],
    ]);
  });

  it('U-05: forwards an empty-string candidateName as-is for repository-side handling', async () => {
    await new GetElectionCandidaciesUseCase(elections, candidacies).execute({
      electionId: 'election-1',
      candidateName: '',
    });

    expect(candidacies.findByElection.mock.calls).toStrictEqual([
      ['election-1', { candidateName: '' }],
    ]);
  });

  it('U-06: filters by a partial, case-insensitive election name match', async () => {
    const result = await new GetElectionCandidaciesUseCase(elections, candidacies).execute({
      electionId: 'election-1',
      electionName: 'council',
    });

    expect(result.candidacies).toHaveLength(1);
    expect(candidacies.findByElection.mock.calls).toHaveLength(1);
  });

  it('U-07: the election name filter is case-insensitive', async () => {
    const result = await new GetElectionCandidaciesUseCase(elections, candidacies).execute({
      electionId: 'election-1',
      electionName: 'STUDENT',
    });

    expect(result.candidacies).toHaveLength(1);
    expect(candidacies.findByElection.mock.calls).toHaveLength(1);
  });

  it('U-08: trims the election name filter before matching', async () => {
    const result = await new GetElectionCandidaciesUseCase(elections, candidacies).execute({
      electionId: 'election-1',
      electionName: '  Student Council  ',
    });

    expect(result.candidacies).toHaveLength(1);
    expect(candidacies.findByElection.mock.calls).toHaveLength(1);
  });

  it('U-09: ignores a whitespace-only election name filter and still queries the repository', async () => {
    const result = await new GetElectionCandidaciesUseCase(elections, candidacies).execute({
      electionId: 'election-1',
      electionName: '   ',
    });

    expect(result.candidacies).toHaveLength(1);
    expect(candidacies.findByElection.mock.calls).toHaveLength(1);
  });

  it('U-10: returns an empty list without querying the repository when the election name does not match', async () => {
    const result = await new GetElectionCandidaciesUseCase(elections, candidacies).execute({
      electionId: 'election-1',
      electionName: 'Football Tournament',
    });

    expect(result).toEqual({ electionName: 'Student Council Election 2026', candidacies: [] });
    expect(candidacies.findByElection.mock.calls).toHaveLength(0);
  });

  it('U-11: applies the candidateName and electionName filters together (AND semantics)', async () => {
    const result = await new GetElectionCandidaciesUseCase(elections, candidacies).execute({
      electionId: 'election-1',
      candidateName: 'Garcia',
      electionName: 'Student',
    });

    expect(result.candidacies).toHaveLength(1);
    expect(candidacies.findByElection.mock.calls).toStrictEqual([
      ['election-1', { candidateName: 'Garcia' }],
    ]);
  });

  it('U-12: throws ElectionNotFoundError and never queries candidacies for a nonexistent election', async () => {
    elections.findById.mockResolvedValue(null);

    await expect(
      new GetElectionCandidaciesUseCase(elections, candidacies).execute({
        electionId: 'election-1',
      }),
    ).rejects.toBeInstanceOf(ElectionNotFoundError);
    expect(candidacies.findByElection.mock.calls).toHaveLength(0);
  });

  it('U-13: propagates an unexpected election lookup failure without querying candidacies', async () => {
    elections.findById.mockRejectedValue(new Error('database exploded'));

    await expect(
      new GetElectionCandidaciesUseCase(elections, candidacies).execute({
        electionId: 'election-1',
      }),
    ).rejects.toThrow('database exploded');
    expect(candidacies.findByElection.mock.calls).toHaveLength(0);
  });

  it('U-14: propagates an unexpected repository failure unchanged', async () => {
    candidacies.findByElection.mockRejectedValue(new Error('database exploded'));

    await expect(
      new GetElectionCandidaciesUseCase(elections, candidacies).execute({
        electionId: 'election-1',
      }),
    ).rejects.toThrow('database exploded');
  });
});
