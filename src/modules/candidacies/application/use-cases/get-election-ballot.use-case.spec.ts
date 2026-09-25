import {
  ElectionEntity,
  ELECTION_STATUSES,
} from 'src/modules/elections/domain/entities/election.entity';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type {
  CandidacyRepository,
  CandidacyWithCandidate,
} from '../../domain/repositories/candidacy.repository.interface';
import { ElectionNoValidCandidatesError } from '../../domain/errors/election-no-valid-candidates.error';
import { GetElectionBallotUseCase } from './get-election-ballot.use-case';

function buildElection(
  overrides: Partial<{
    currentStatus: ElectionEntity['currentStatus'];
    blankVoteEnabled: boolean;
    name: string;
  }> = {},
): ElectionEntity {
  return ElectionEntity.restore({
    id: 'election-1',
    name: overrides.name ?? 'Student Council Election 2026',
    description: 'Election for the 2026 student council.',
    startDate: new Date(Date.UTC(2026, 9, 1)),
    startTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
    endDate: new Date(Date.UTC(2026, 9, 1)),
    endTime: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
    currentStatus: overrides.currentStatus ?? 'CREATED',
    blankVoteEnabled: overrides.blankVoteEnabled ?? false,
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

describe('GetElectionBallotUseCase', () => {
  const elections: jest.Mocked<ElectionRepository> = {
    findAll: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    findStatusHistory: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    hasCandidates: jest.fn(),
    hasVotes: jest.fn(),
    findExpiredActive: jest.fn(),
    delete: jest.fn(),
  };

  const candidacies: jest.Mocked<CandidacyRepository> = {
    findUsedPositions: jest.fn(),
    create: jest.fn(),
    findByElection: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    deleteByElectionAndCandidacyId: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    elections.findById.mockResolvedValue(buildElection());
    candidacies.findByElection.mockResolvedValue([buildCandidacy()]);
  });

  it('EB-U-01: returns election identity, the blank-vote option, and candidacies on success', async () => {
    elections.findById.mockResolvedValue(buildElection({ blankVoteEnabled: true }));
    candidacies.findByElection.mockResolvedValue([
      buildCandidacy(),
      buildCandidacy({ id: 'candidacy-2', positionNumber: 2 }),
    ]);

    const result = await new GetElectionBallotUseCase(elections, candidacies).execute({
      electionId: 'election-1',
    });

    expect(result).toEqual({
      electionId: 'election-1',
      electionName: 'Student Council Election 2026',
      blankVote: { id: 'blank', enabled: true },
      candidacies: [
        expect.objectContaining({ id: 'candidacy-1' }),
        expect.objectContaining({ id: 'candidacy-2' }),
      ],
    });
  });

  it('EB-U-02: exposes the blank-vote option as available when the election enables blank voting', async () => {
    elections.findById.mockResolvedValue(buildElection({ blankVoteEnabled: true }));

    const result = await new GetElectionBallotUseCase(elections, candidacies).execute({
      electionId: 'election-1',
    });

    expect(result.blankVote).toEqual({ id: 'blank', enabled: true });
  });

  it('EB-U-03: exposes the blank-vote option as available even when blank voting is disabled (display override)', async () => {
    elections.findById.mockResolvedValue(buildElection({ blankVoteEnabled: false }));

    const result = await new GetElectionBallotUseCase(elections, candidacies).execute({
      electionId: 'election-1',
    });

    expect(result.blankVote).toEqual({ id: 'blank', enabled: true });
    expect(result.candidacies).toHaveLength(1);
  });

  it('EB-U-04: passes candidacies through verbatim, preserving id, positionNumber, and repo order', async () => {
    const rows = [
      buildCandidacy({ positionNumber: 1 }),
      buildCandidacy({ id: 'candidacy-3', candidateId: 'candidate-3', positionNumber: 3 }),
      buildCandidacy({ id: 'candidacy-4', candidateId: 'candidate-4', positionNumber: 4 }),
    ];
    candidacies.findByElection.mockResolvedValue(rows);

    const result = await new GetElectionBallotUseCase(elections, candidacies).execute({
      electionId: 'election-1',
    });

    expect(result.candidacies).toBe(rows);
    expect(result.candidacies.map((c) => c.positionNumber)).toEqual([1, 3, 4]);
  });

  it('EB-U-05: throws ElectionNotFoundError and never queries candidacies for a nonexistent election', async () => {
    elections.findById.mockResolvedValue(null);

    await expect(
      new GetElectionBallotUseCase(elections, candidacies).execute({
        electionId: 'election-1',
      }),
    ).rejects.toBeInstanceOf(ElectionNotFoundError);
    expect(candidacies.findByElection.mock.calls).toHaveLength(0);
  });

  it('EB-U-06: throws ElectionNoValidCandidatesError when the election has no valid candidates', async () => {
    candidacies.findByElection.mockResolvedValue([]);

    await expect(
      new GetElectionBallotUseCase(elections, candidacies).execute({
        electionId: 'election-1',
      }),
    ).rejects.toBeInstanceOf(ElectionNoValidCandidatesError);
  });

  it.each(ELECTION_STATUSES)(
    'EB-U-07: returns the ballot for an election in status %s (no status gate)',
    async (status) => {
      elections.findById.mockResolvedValue(buildElection({ currentStatus: status }));

      const result = await new GetElectionBallotUseCase(elections, candidacies).execute({
        electionId: 'election-1',
      });

      expect(result.candidacies).toHaveLength(1);
    },
  );

  it('EB-U-08: queries findByElection with exactly the requested electionId', async () => {
    await new GetElectionBallotUseCase(elections, candidacies).execute({
      electionId: 'election-1',
    });

    expect(candidacies.findByElection.mock.calls).toStrictEqual([['election-1']]);
    expect(elections.findById.mock.calls).toStrictEqual([['election-1']]);
  });

  it('EB-U-09: is read-only - no repository write or auxiliary method is ever invoked', async () => {
    await new GetElectionBallotUseCase(elections, candidacies).execute({
      electionId: 'election-1',
    });

    expect(elections.findById.mock.calls).toHaveLength(1);
    expect(candidacies.findByElection.mock.calls).toHaveLength(1);

    expect(elections.create.mock.calls).toHaveLength(0);
    expect(elections.update.mock.calls).toHaveLength(0);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
    expect(elections.delete.mock.calls).toHaveLength(0);
    expect(elections.hasCandidates.mock.calls).toHaveLength(0);
    expect(elections.hasVotes.mock.calls).toHaveLength(0);

    expect(candidacies.create.mock.calls).toHaveLength(0);
    expect(candidacies.update.mock.calls).toHaveLength(0);
    expect(candidacies.deleteByElectionAndCandidacyId.mock.calls).toHaveLength(0);
    expect(candidacies.findById.mock.calls).toHaveLength(0);
    expect(candidacies.findUsedPositions.mock.calls).toHaveLength(0);
  });

  it('EB-U-10: propagates an unexpected election lookup failure without querying candidacies', async () => {
    elections.findById.mockRejectedValue(new Error('database exploded'));

    await expect(
      new GetElectionBallotUseCase(elections, candidacies).execute({
        electionId: 'election-1',
      }),
    ).rejects.toThrow('database exploded');
    expect(candidacies.findByElection.mock.calls).toHaveLength(0);
  });

  it('EB-U-11: propagates an unexpected candidacy repository failure unchanged', async () => {
    candidacies.findByElection.mockRejectedValue(new Error('database exploded'));

    await expect(
      new GetElectionBallotUseCase(elections, candidacies).execute({
        electionId: 'election-1',
      }),
    ).rejects.toThrow('database exploded');
  });

  it.each([true, false])(
    'EB-U-12: exposes the blank-vote option with the stable id and enabled true for blank voting %s',
    async (blankVoteEnabled) => {
      elections.findById.mockResolvedValue(buildElection({ blankVoteEnabled }));

      const result = await new GetElectionBallotUseCase(elections, candidacies).execute({
        electionId: 'election-1',
      });

      expect(result.blankVote).toEqual({ id: 'blank', enabled: true });
    },
  );
});
