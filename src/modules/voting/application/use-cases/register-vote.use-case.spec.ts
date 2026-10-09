import { CandidacyNotFoundError } from 'src/modules/candidacies/domain/errors/candidacy-not-found.error';
import type {
  CandidacyRepository,
  CandidacyWithCandidate,
} from 'src/modules/candidacies/domain/repositories/candidacy.repository.interface';
import { ElectionEntity } from 'src/modules/elections/domain/entities/election.entity';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import { ElectionNotWithinScheduleError } from 'src/modules/elections/domain/errors/election-not-within-schedule.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import { ElectoralRollEntity } from 'src/modules/electoral-rolls/domain/entities/electoral-roll.entity';
import { ElectoralRollNotFoundError } from 'src/modules/electoral-rolls/domain/errors/electoral-roll-not-found.error';
import type { ElectoralRollRepository } from 'src/modules/electoral-rolls/domain/repositories/electoral-roll.repository.interface';
import { BlankVoteDisabledError } from '../../domain/errors/blank-vote-disabled.error';
import { ElectionNotActiveError } from '../../domain/errors/election-not-active.error';
import { IdempotencyKeyConflictError } from '../../domain/errors/idempotency-key-conflict.error';
import { VoteAlreadyRegisteredError } from '../../domain/errors/vote-already-registered.error';
import type { VoteRepository } from '../../domain/repositories/vote.repository.interface';
import { RegisterVoteUseCase, type RegisterVoteInput } from './register-vote.use-case';

const NOT_ACTIVE_STATUSES = ['CREATED', 'PENDING', 'PUBLISHED', 'CLOSED', 'CANCELLED'] as const;

// Narrow single-day window: 2026-10-01 08:00Z .. 18:00Z (schedule boundary tests).
const NARROW_WINDOW = {
  startDate: new Date(Date.UTC(2026, 9, 1)),
  startTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
  endDate: new Date(Date.UTC(2026, 9, 1)),
  endTime: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
};

// Multi-day (overnight) window: 2026-09-30 22:00Z .. 2026-10-01 02:00Z.
const OVERNIGHT_WINDOW = {
  startDate: new Date(Date.UTC(2026, 9, 30)),
  startTime: new Date(Date.UTC(1970, 0, 1, 22, 0, 0)),
  endDate: new Date(Date.UTC(2026, 10, 1)),
  endTime: new Date(Date.UTC(1970, 0, 1, 2, 0, 0)),
};

function buildElection(
  overrides: Partial<{
    currentStatus: ElectionEntity['currentStatus'];
    blankVoteEnabled: boolean;
    startDate: Date;
    startTime: Date;
    endDate: Date;
    endTime: Date;
  }> = {},
): ElectionEntity {
  return ElectionEntity.restore({
    id: 'election-1',
    name: 'Student Council Election 2026',
    description: 'Election for the 2026 student council.',
    // Default to a deliberately wide window so tests not concerned with the schedule
    // always run inside it. Schedule-specific tests override these fields explicitly.
    startDate: overrides.startDate ?? new Date(Date.UTC(2000, 0, 1)),
    startTime: overrides.startTime ?? new Date(Date.UTC(1970, 0, 1, 0, 0, 0)),
    endDate: overrides.endDate ?? new Date(Date.UTC(2100, 0, 1)),
    endTime: overrides.endTime ?? new Date(Date.UTC(1970, 0, 1, 0, 0, 0)),
    currentStatus: overrides.currentStatus ?? 'ACTIVE',
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

function buildRoll(): ElectoralRollEntity {
  return ElectoralRollEntity.create({ electionId: 'election-1', electorId: 'elector-1' });
}

function buildVotedRoll(
  overrides: Partial<{
    candidacyId: string;
    idempotencyKey: string | null;
    registeredAt: Date;
  }> = {},
): ElectoralRollEntity {
  return ElectoralRollEntity.restore({
    id: 'roll-1',
    electionId: 'election-1',
    electorId: 'elector-1',
    hasVoted: true,
    voteAttempts: 1,
    lastVoteAttempt: new Date('2026-09-29T14:03:00.000Z'),
    lastVoteCandidacyId: overrides.candidacyId ?? 'candidacy-1',
    lastVoteIdempotencyKey: overrides.idempotencyKey ?? null,
    lastVoteRegisteredAt: overrides.registeredAt ?? new Date('2026-09-29T14:03:00.000Z'),
    createdAt: new Date('2026-08-19T15:00:00.000Z'),
  });
}

describe('RegisterVoteUseCase', () => {
  const elections: jest.Mocked<ElectionRepository> = {
    findAll: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    findStatusHistory: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    hasCandidates: jest.fn(),
    hasElectoralRoll: jest.fn(),
    hasVotes: jest.fn(),
    findExpiredActive: jest.fn(),
    delete: jest.fn(),
  };

  const electoralRolls: jest.Mocked<ElectoralRollRepository> = {
    findByElectionAndElectorIds: jest.fn(),
    createMany: jest.fn(),
    countByElection: jest.fn(),
    deleteByElectionAndElectorId: jest.fn(),
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

  const votes: jest.Mocked<VoteRepository> = {
    recordVote: jest.fn(),
  };

  function buildUseCase(): RegisterVoteUseCase {
    return new RegisterVoteUseCase(elections, electoralRolls, candidacies, votes);
  }

  function buildInput(overrides: Partial<RegisterVoteInput> = {}): RegisterVoteInput {
    return {
      electionId: 'election-1',
      electorId: 'elector-1',
      candidacyId: 'candidacy-1',
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    elections.findById.mockResolvedValue(buildElection());
    electoralRolls.findByElectionAndElectorIds.mockResolvedValue([buildRoll()]);
    candidacies.findByElection.mockResolvedValue([buildCandidacy()]);
    votes.recordVote.mockResolvedValue({ outcome: 'recorded' });
  });

  describe('candidacy vote', () => {
    it('RV-01: records the vote through the repository and returns the confirmation', async () => {
      const now = new Date('2026-09-29T14:03:00.000Z');
      const result = await buildUseCase().execute(buildInput({ now }));

      expect(result).toEqual({
        electionId: 'election-1',
        candidacyId: 'candidacy-1',
        registeredAt: now,
      });
      expect(votes.recordVote.mock.calls).toStrictEqual([
        [
          {
            electionId: 'election-1',
            electorId: 'elector-1',
            candidacyId: 'candidacy-1',
            idempotencyKey: null,
            now,
          },
        ],
      ]);
    });

    it('RV-02: uses a server timestamp when none is provided', async () => {
      const result = await buildUseCase().execute(buildInput());

      expect(result.registeredAt).toBeInstanceOf(Date);
      expect(votes.recordVote.mock.calls[0][0]).toMatchObject({ now: result.registeredAt });
    });

    it('RV-03: forwards a provided idempotency key to the repository', async () => {
      await buildUseCase().execute(buildInput({ idempotencyKey: 'key-abc' }));

      expect(votes.recordVote.mock.calls[0][0]).toMatchObject({ idempotencyKey: 'key-abc' });
    });
  });

  describe('blank vote', () => {
    it('RV-04: records a blank-vote claim with candidacyId "blank"', async () => {
      elections.findById.mockResolvedValue(buildElection({ blankVoteEnabled: true }));

      const result = await buildUseCase().execute(buildInput({ candidacyId: 'blank' }));

      expect(result).toMatchObject({ electionId: 'election-1', candidacyId: 'blank' });
      expect(votes.recordVote.mock.calls[0][0]).toMatchObject({ candidacyId: 'blank' });
    });

    it('RV-05: rejects a blank vote when blank voting is disabled', async () => {
      elections.findById.mockResolvedValue(buildElection({ blankVoteEnabled: false }));

      await expect(
        buildUseCase().execute(buildInput({ candidacyId: 'blank' })),
      ).rejects.toBeInstanceOf(BlankVoteDisabledError);
      expect(votes.recordVote.mock.calls).toHaveLength(0);
    });
  });

  describe('election validation', () => {
    it('RV-06: throws ElectionNotFoundError when the election does not exist', async () => {
      elections.findById.mockResolvedValue(null);

      await expect(buildUseCase().execute(buildInput())).rejects.toBeInstanceOf(
        ElectionNotFoundError,
      );
      expect(votes.recordVote.mock.calls).toHaveLength(0);
    });

    it.each(NOT_ACTIVE_STATUSES)(
      'RV-07: throws ElectionNotActiveError when the election is %s',
      async (status) => {
        elections.findById.mockResolvedValue(buildElection({ currentStatus: status }));

        await expect(buildUseCase().execute(buildInput())).rejects.toBeInstanceOf(
          ElectionNotActiveError,
        );
        expect(votes.recordVote.mock.calls).toHaveLength(0);
      },
    );

    it('RV-08: throws ElectionNotActiveError when the repository reports election_not_active (cancellation won the race)', async () => {
      votes.recordVote.mockResolvedValue({ outcome: 'election_not_active' });

      await expect(buildUseCase().execute(buildInput())).rejects.toBeInstanceOf(
        ElectionNotActiveError,
      );
    });
  });

  describe('election schedule', () => {
    // Narrow window (2026-10-01 08:00Z .. 18:00Z) so the boundary assertions below are
    // meaningful (the default buildElection window is intentionally wide).
    beforeEach(() => {
      elections.findById.mockResolvedValue(buildElection({ ...NARROW_WINDOW }));
    });

    it('RV-21: rejects a vote before the configured start instant', async () => {
      const now = new Date(Date.UTC(2026, 9, 1, 7, 59, 59));

      await expect(buildUseCase().execute(buildInput({ now }))).rejects.toBeInstanceOf(
        ElectionNotWithinScheduleError,
      );
      expect(votes.recordVote.mock.calls).toHaveLength(0);
    });

    it('RV-22: allows a vote exactly at the start instant (inclusive)', async () => {
      const now = new Date(Date.UTC(2026, 9, 1, 8, 0, 0));

      const result = await buildUseCase().execute(buildInput({ now }));

      expect(result).toMatchObject({ electionId: 'election-1', candidacyId: 'candidacy-1' });
      expect(votes.recordVote.mock.calls).toHaveLength(1);
    });

    it('RV-23: allows a vote strictly inside the voting window', async () => {
      const now = new Date(Date.UTC(2026, 9, 1, 12, 0, 0));

      const result = await buildUseCase().execute(buildInput({ now }));

      expect(result).toMatchObject({ electionId: 'election-1', candidacyId: 'candidacy-1' });
      expect(votes.recordVote.mock.calls).toHaveLength(1);
    });

    it('RV-24: allows a vote exactly at the end instant (inclusive)', async () => {
      const now = new Date(Date.UTC(2026, 9, 1, 18, 0, 0));

      const result = await buildUseCase().execute(buildInput({ now }));

      expect(result).toMatchObject({ electionId: 'election-1', candidacyId: 'candidacy-1' });
      expect(votes.recordVote.mock.calls).toHaveLength(1);
    });

    it('RV-25: rejects a vote after the configured end instant', async () => {
      const now = new Date(Date.UTC(2026, 9, 1, 18, 0, 1));

      await expect(buildUseCase().execute(buildInput({ now }))).rejects.toBeInstanceOf(
        ElectionNotWithinScheduleError,
      );
      expect(votes.recordVote.mock.calls).toHaveLength(0);
    });

    it('RV-26: allows a vote inside a multi-day (overnight) voting window', async () => {
      elections.findById.mockResolvedValue(buildElection({ ...OVERNIGHT_WINDOW }));
      const inside = new Date(Date.UTC(2026, 10, 1, 0, 30, 0));

      const result = await buildUseCase().execute(buildInput({ now: inside }));

      expect(result).toMatchObject({ electionId: 'election-1', candidacyId: 'candidacy-1' });
      expect(votes.recordVote.mock.calls).toHaveLength(1);
    });

    it('RV-27: rejects a multi-day window outside its boundaries', async () => {
      elections.findById.mockResolvedValue(buildElection({ ...OVERNIGHT_WINDOW }));

      const beforeStart = new Date(Date.UTC(2026, 9, 30, 21, 59, 59));
      await expect(buildUseCase().execute(buildInput({ now: beforeStart }))).rejects.toBeInstanceOf(
        ElectionNotWithinScheduleError,
      );

      const afterEnd = new Date(Date.UTC(2026, 10, 1, 2, 0, 1));
      await expect(buildUseCase().execute(buildInput({ now: afterEnd }))).rejects.toBeInstanceOf(
        ElectionNotWithinScheduleError,
      );
      expect(votes.recordVote.mock.calls).toHaveLength(0);
    });

    it('RV-28: state check runs before the schedule check', async () => {
      elections.findById.mockResolvedValue(buildElection({ currentStatus: 'CLOSED' }));
      const inWindow = new Date(Date.UTC(2026, 9, 1, 12, 0, 0));

      await expect(buildUseCase().execute(buildInput({ now: inWindow }))).rejects.toBeInstanceOf(
        ElectionNotActiveError,
      );
      expect(votes.recordVote.mock.calls).toHaveLength(0);
    });

    it('RV-29: schedule check runs before blank-vote validation', async () => {
      // Out-of-window with blank voting disabled: the schedule error surfaces first.
      const now = new Date(Date.UTC(2026, 9, 1, 7, 59, 59));

      await expect(
        buildUseCase().execute(buildInput({ candidacyId: 'blank', now })),
      ).rejects.toBeInstanceOf(ElectionNotWithinScheduleError);
      expect(votes.recordVote.mock.calls).toHaveLength(0);
    });

    it('RV-30: schedule check runs before candidacy validation', async () => {
      // Out-of-window with an unknown candidacy: the schedule error surfaces first.
      const now = new Date(Date.UTC(2026, 9, 1, 18, 0, 1));

      await expect(
        buildUseCase().execute(buildInput({ candidacyId: 'candidacy-unknown', now })),
      ).rejects.toBeInstanceOf(ElectionNotWithinScheduleError);
      expect(votes.recordVote.mock.calls).toHaveLength(0);
    });
  });

  describe('electoral-roll membership', () => {
    it('RV-08: throws ElectoralRollNotFoundError when the elector is not in the roll', async () => {
      electoralRolls.findByElectionAndElectorIds.mockResolvedValue([]);

      await expect(buildUseCase().execute(buildInput())).rejects.toBeInstanceOf(
        ElectoralRollNotFoundError,
      );
      expect(votes.recordVote.mock.calls).toHaveLength(0);
    });
  });

  describe('candidacy validation', () => {
    it('RV-09: throws CandidacyNotFoundError when the candidacy is unknown', async () => {
      candidacies.findByElection.mockResolvedValue([buildCandidacy()]);

      await expect(
        buildUseCase().execute(buildInput({ candidacyId: 'candidacy-unknown' })),
      ).rejects.toBeInstanceOf(CandidacyNotFoundError);
      expect(votes.recordVote.mock.calls).toHaveLength(0);
    });

    it('RV-10: rejects a candidacy that belongs to another election', async () => {
      candidacies.findByElection.mockResolvedValue([
        buildCandidacy({ id: 'candidacy-other', electionId: 'election-other' }),
      ]);

      await expect(
        buildUseCase().execute(buildInput({ candidacyId: 'candidacy-1' })),
      ).rejects.toBeInstanceOf(CandidacyNotFoundError);
      expect(votes.recordVote.mock.calls).toHaveLength(0);
    });

    it('RV-11: rejects a candidacy whose candidate is INACTIVE', async () => {
      candidacies.findByElection.mockResolvedValue([]);

      await expect(buildUseCase().execute(buildInput())).rejects.toBeInstanceOf(
        CandidacyNotFoundError,
      );
      expect(votes.recordVote.mock.calls).toHaveLength(0);
    });
  });

  describe('anonymity', () => {
    it('RV-12: the successful result exposes no elector identity or vote internals', async () => {
      const result = await buildUseCase().execute(buildInput());

      expect(Object.keys(result).sort()).toEqual(['candidacyId', 'electionId', 'registeredAt']);
    });
  });

  describe('retry / idempotency', () => {
    it('RV-13: replays the stored result on a retry with the same idempotency key', async () => {
      const registeredAt = new Date('2026-09-29T14:03:00.000Z');
      electoralRolls.findByElectionAndElectorIds.mockResolvedValue([
        buildVotedRoll({ candidacyId: 'candidacy-1', idempotencyKey: 'K', registeredAt }),
      ]);

      const result = await buildUseCase().execute(
        buildInput({ candidacyId: 'candidacy-1', idempotencyKey: 'K' }),
      );

      expect(result).toEqual({
        electionId: 'election-1',
        candidacyId: 'candidacy-1',
        registeredAt,
      });
      expect(votes.recordVote.mock.calls).toHaveLength(0);
    });

    it('RV-14: rejects a reused key with a different candidacy as a conflict', async () => {
      electoralRolls.findByElectionAndElectorIds.mockResolvedValue([
        buildVotedRoll({ candidacyId: 'candidacy-1', idempotencyKey: 'K' }),
      ]);

      await expect(
        buildUseCase().execute(buildInput({ candidacyId: 'candidacy-2', idempotencyKey: 'K' })),
      ).rejects.toBeInstanceOf(IdempotencyKeyConflictError);
      expect(votes.recordVote.mock.calls).toHaveLength(0);
    });

    it('RV-15: rejects a duplicate vote made with a different key', async () => {
      electoralRolls.findByElectionAndElectorIds.mockResolvedValue([
        buildVotedRoll({ candidacyId: 'candidacy-1', idempotencyKey: 'K' }),
      ]);

      await expect(
        buildUseCase().execute(buildInput({ candidacyId: 'candidacy-1', idempotencyKey: 'L' })),
      ).rejects.toBeInstanceOf(VoteAlreadyRegisteredError);
      expect(votes.recordVote.mock.calls).toHaveLength(0);
    });

    it('RV-16: rejects a duplicate vote made without an idempotency key', async () => {
      electoralRolls.findByElectionAndElectorIds.mockResolvedValue([
        buildVotedRoll({ candidacyId: 'candidacy-1', idempotencyKey: 'K' }),
      ]);

      await expect(
        buildUseCase().execute(buildInput({ candidacyId: 'candidacy-1' })),
      ).rejects.toBeInstanceOf(VoteAlreadyRegisteredError);
      expect(votes.recordVote.mock.calls).toHaveLength(0);
    });

    it('RV-17: replays when a concurrent claim is lost but the key matches', async () => {
      votes.recordVote.mockResolvedValue({ outcome: 'already_voted' });
      electoralRolls.findByElectionAndElectorIds
        .mockResolvedValueOnce([buildRoll()])
        .mockResolvedValueOnce([
          buildVotedRoll({ candidacyId: 'candidacy-1', idempotencyKey: 'K' }),
        ]);

      const result = await buildUseCase().execute(
        buildInput({ candidacyId: 'candidacy-1', idempotencyKey: 'K' }),
      );

      expect(result).toMatchObject({ electionId: 'election-1', candidacyId: 'candidacy-1' });
      expect(votes.recordVote.mock.calls).toHaveLength(1);
    });

    it('RV-18: rejects as a duplicate when a concurrent claim is lost without a matching key', async () => {
      votes.recordVote.mockResolvedValue({ outcome: 'already_voted' });
      electoralRolls.findByElectionAndElectorIds
        .mockResolvedValueOnce([buildRoll()])
        .mockResolvedValueOnce([
          buildVotedRoll({ candidacyId: 'candidacy-1', idempotencyKey: 'K' }),
        ]);

      await expect(
        buildUseCase().execute(buildInput({ candidacyId: 'candidacy-1', idempotencyKey: 'L' })),
      ).rejects.toBeInstanceOf(VoteAlreadyRegisteredError);
      expect(votes.recordVote.mock.calls).toHaveLength(1);
    });

    it('RV-19: a matching-key retry still replays after the election has closed', async () => {
      elections.findById.mockResolvedValue(buildElection({ currentStatus: 'CLOSED' }));
      electoralRolls.findByElectionAndElectorIds.mockResolvedValue([
        buildVotedRoll({ candidacyId: 'candidacy-1', idempotencyKey: 'K' }),
      ]);

      const result = await buildUseCase().execute(
        buildInput({ candidacyId: 'candidacy-1', idempotencyKey: 'K' }),
      );

      expect(result).toMatchObject({ candidacyId: 'candidacy-1' });
      expect(votes.recordVote.mock.calls).toHaveLength(0);
    });

    it('RV-20: a failed write can be retried successfully without leaving a vote', async () => {
      votes.recordVote.mockRejectedValueOnce(new Error('db failure')).mockResolvedValueOnce({
        outcome: 'recorded',
      });

      await expect(buildUseCase().execute(buildInput({ idempotencyKey: 'K' }))).rejects.toThrow(
        'db failure',
      );

      const result = await buildUseCase().execute(buildInput({ idempotencyKey: 'K' }));

      expect(result).toMatchObject({ electionId: 'election-1', candidacyId: 'candidacy-1' });
      expect(votes.recordVote.mock.calls).toHaveLength(2);
    });
  });
});
