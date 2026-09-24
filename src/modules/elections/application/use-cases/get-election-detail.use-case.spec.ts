import { ElectionEntity } from 'src/modules/elections/domain/entities/election.entity';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type {
  ElectionRepository,
  ElectionStatusHistoryEntry,
} from 'src/modules/elections/domain/repositories/election.repository.interface';
import type {
  CandidacyRepository,
  CandidacyWithCandidate,
} from 'src/modules/candidacies/domain/repositories/candidacy.repository.interface';
import type { ElectoralRollRepository } from 'src/modules/electoral-rolls/domain/repositories/electoral-roll.repository.interface';
import { GetElectionDetailUseCase } from './get-election-detail.use-case';

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

function buildStatusHistoryEntry(
  overrides: Partial<ElectionStatusHistoryEntry> = {},
): ElectionStatusHistoryEntry {
  return {
    status: 'PENDING',
    timestamp: new Date('2026-08-20T10:00:00.000Z'),
    ...overrides,
  };
}

describe('GetElectionDetailUseCase', () => {
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
    delete: jest.fn(),
  };

  const candidacies: jest.Mocked<CandidacyRepository> = {
    findUsedPositions: jest.fn(),
    create: jest.fn(),
    findByElection: jest.fn(),
    findById: jest.fn(),
    findByCandidate: jest.fn(),
    update: jest.fn(),
    deleteByElectionAndCandidacyId: jest.fn(),
  };

  const electoralRolls: jest.Mocked<ElectoralRollRepository> = {
    findByElectionAndElectorIds: jest.fn(),
    createMany: jest.fn(),
    countByElection: jest.fn(),
    deleteByElectionAndElectorId: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    elections.findById.mockResolvedValue(buildElection());
    elections.findStatusHistory.mockResolvedValue([buildStatusHistoryEntry()]);
    candidacies.findByElection.mockResolvedValue([buildCandidacy()]);
    electoralRolls.countByElection.mockResolvedValue(1250);
  });

  it('D-U-01: returns the election, persisted status history, candidacies and elector count from the repositories', async () => {
    const election = buildElection();
    const history = [
      buildStatusHistoryEntry({
        status: 'PENDING',
        timestamp: new Date('2026-08-20T10:00:00.000Z'),
      }),
      buildStatusHistoryEntry({
        status: 'ACTIVE',
        timestamp: new Date('2026-08-21T10:00:00.000Z'),
      }),
    ];
    const rows = [buildCandidacy(), buildCandidacy({ id: 'candidacy-2', positionNumber: 2 })];
    elections.findById.mockResolvedValue(election);
    elections.findStatusHistory.mockResolvedValue(history);
    candidacies.findByElection.mockResolvedValue(rows);
    electoralRolls.countByElection.mockResolvedValue(42);

    const result = await new GetElectionDetailUseCase(
      elections,
      candidacies,
      electoralRolls,
    ).execute('election-1');

    expect(result).toEqual({
      election,
      statusHistory: history,
      candidacies: rows,
      registeredVoters: 42,
    });
  });

  it('D-U-02: runs all relation queries with the same election id (consistency rule)', async () => {
    await new GetElectionDetailUseCase(elections, candidacies, electoralRolls).execute(
      'election-1',
    );

    expect(elections.findStatusHistory.mock.calls).toStrictEqual([['election-1']]);
    expect(candidacies.findByElection.mock.calls).toStrictEqual([['election-1']]);
    expect(electoralRolls.countByElection.mock.calls).toStrictEqual([['election-1']]);
  });

  it('D-U-03: queries relations only after the election lookup succeeds', async () => {
    await new GetElectionDetailUseCase(elections, candidacies, electoralRolls).execute(
      'election-1',
    );

    expect(elections.findById.mock.calls).toHaveLength(1);
    expect(elections.findStatusHistory.mock.calls).toHaveLength(1);
    expect(candidacies.findByElection.mock.calls).toHaveLength(1);
    expect(electoralRolls.countByElection.mock.calls).toHaveLength(1);
  });

  it('D-U-04: passes through empty history, empty candidacies and a zero elector count untouched', async () => {
    elections.findStatusHistory.mockResolvedValue([]);
    candidacies.findByElection.mockResolvedValue([]);
    electoralRolls.countByElection.mockResolvedValue(0);

    const result = await new GetElectionDetailUseCase(
      elections,
      candidacies,
      electoralRolls,
    ).execute('election-1');

    expect(result.election).toBeInstanceOf(ElectionEntity);
    expect(result.statusHistory).toEqual([]);
    expect(result.candidacies).toEqual([]);
    expect(result.registeredVoters).toBe(0);
  });

  it('D-U-05: throws ElectionNotFoundError and never queries relations for a nonexistent election', async () => {
    elections.findById.mockResolvedValue(null);

    await expect(
      new GetElectionDetailUseCase(elections, candidacies, electoralRolls).execute('election-1'),
    ).rejects.toBeInstanceOf(ElectionNotFoundError);
    expect(elections.findStatusHistory.mock.calls).toHaveLength(0);
    expect(candidacies.findByElection.mock.calls).toHaveLength(0);
    expect(electoralRolls.countByElection.mock.calls).toHaveLength(0);
  });

  it('D-U-06: propagates an unexpected candidacy query failure unchanged', async () => {
    candidacies.findByElection.mockRejectedValue(new Error('database exploded'));

    await expect(
      new GetElectionDetailUseCase(elections, candidacies, electoralRolls).execute('election-1'),
    ).rejects.toThrow('database exploded');
  });

  it('D-U-07: propagates an unexpected elector-count failure unchanged', async () => {
    electoralRolls.countByElection.mockRejectedValue(new Error('database exploded'));

    await expect(
      new GetElectionDetailUseCase(elections, candidacies, electoralRolls).execute('election-1'),
    ).rejects.toThrow('database exploded');
  });

  it('D-U-08: propagates an unexpected status-history failure unchanged', async () => {
    elections.findStatusHistory.mockRejectedValue(new Error('database exploded'));

    await expect(
      new GetElectionDetailUseCase(elections, candidacies, electoralRolls).execute('election-1'),
    ).rejects.toThrow('database exploded');
  });
});
