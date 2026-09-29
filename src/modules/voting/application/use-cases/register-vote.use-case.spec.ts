import { CandidacyNotFoundError } from 'src/modules/candidacies/domain/errors/candidacy-not-found.error';
import type {
  CandidacyRepository,
  CandidacyWithCandidate,
} from 'src/modules/candidacies/domain/repositories/candidacy.repository.interface';
import { ElectionEntity } from 'src/modules/elections/domain/entities/election.entity';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import { ElectoralRollEntity } from 'src/modules/electoral-rolls/domain/entities/electoral-roll.entity';
import { ElectoralRollNotFoundError } from 'src/modules/electoral-rolls/domain/errors/electoral-roll-not-found.error';
import type { ElectoralRollRepository } from 'src/modules/electoral-rolls/domain/repositories/electoral-roll.repository.interface';
import { BlankVoteDisabledError } from '../../domain/errors/blank-vote-disabled.error';
import { ElectionNotActiveError } from '../../domain/errors/election-not-active.error';
import type { ResultRepository } from '../../domain/repositories/result.repository.interface';
import { RegisterVoteUseCase, type RegisterVoteInput } from './register-vote.use-case';

const NOT_ACTIVE_STATUSES = ['CREATED', 'PENDING', 'PUBLISHED', 'CLOSED'] as const;

function buildElection(
  overrides: Partial<{
    currentStatus: ElectionEntity['currentStatus'];
    blankVoteEnabled: boolean;
  }> = {},
): ElectionEntity {
  return ElectionEntity.restore({
    id: 'election-1',
    name: 'Student Council Election 2026',
    description: 'Election for the 2026 student council.',
    startDate: new Date(Date.UTC(2026, 9, 1)),
    startTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
    endDate: new Date(Date.UTC(2026, 9, 1)),
    endTime: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
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

  const results: jest.Mocked<ResultRepository> = {
    incrementVotes: jest.fn(),
  };

  function buildUseCase(): RegisterVoteUseCase {
    return new RegisterVoteUseCase(elections, electoralRolls, candidacies, results);
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
    electoralRolls.findByElectionAndElectorIds.mockResolvedValue([
      ElectoralRollEntity.create({ electionId: 'election-1', electorId: 'elector-1' }),
    ]);
    candidacies.findByElection.mockResolvedValue([buildCandidacy()]);
  });

  describe('candidacy vote', () => {
    it('RV-01: increments the result tally and returns the registration confirmation', async () => {
      const now = new Date('2026-09-29T14:03:00.000Z');
      const result = await buildUseCase().execute(buildInput({ now }));

      expect(result).toEqual({
        electionId: 'election-1',
        candidacyId: 'candidacy-1',
        registeredAt: now,
      });
      expect(results.incrementVotes.mock.calls).toStrictEqual([['election-1', 'candidacy-1']]);
    });

    it('RV-02: uses a server timestamp when none is provided', async () => {
      const result = await buildUseCase().execute(buildInput());

      expect(result.registeredAt).toBeInstanceOf(Date);
    });

    it('RV-03: does not touch the electoral-roll voting state', async () => {
      await buildUseCase().execute(buildInput());

      expect(electoralRolls.createMany.mock.calls).toHaveLength(0);
      expect(electoralRolls.deleteByElectionAndElectorId.mock.calls).toHaveLength(0);
    });
  });

  describe('blank vote', () => {
    it('RV-04: accepts an enabled blank vote and writes nothing to Result', async () => {
      elections.findById.mockResolvedValue(buildElection({ blankVoteEnabled: true }));

      const result = await buildUseCase().execute(buildInput({ candidacyId: 'blank' }));

      expect(result).toMatchObject({ electionId: 'election-1', candidacyId: 'blank' });
      expect(results.incrementVotes.mock.calls).toHaveLength(0);
    });

    it('RV-05: rejects a blank vote when blank voting is disabled', async () => {
      elections.findById.mockResolvedValue(buildElection({ blankVoteEnabled: false }));

      await expect(
        buildUseCase().execute(buildInput({ candidacyId: 'blank' })),
      ).rejects.toBeInstanceOf(BlankVoteDisabledError);
      expect(results.incrementVotes.mock.calls).toHaveLength(0);
    });
  });

  describe('election validation', () => {
    it('RV-06: throws ElectionNotFoundError when the election does not exist', async () => {
      elections.findById.mockResolvedValue(null);

      await expect(buildUseCase().execute(buildInput())).rejects.toBeInstanceOf(
        ElectionNotFoundError,
      );
      expect(results.incrementVotes.mock.calls).toHaveLength(0);
    });

    it.each(NOT_ACTIVE_STATUSES)(
      'RV-07: throws ElectionNotActiveError when the election is %s',
      async (status) => {
        elections.findById.mockResolvedValue(buildElection({ currentStatus: status }));

        await expect(buildUseCase().execute(buildInput())).rejects.toBeInstanceOf(
          ElectionNotActiveError,
        );
        expect(results.incrementVotes.mock.calls).toHaveLength(0);
      },
    );
  });

  describe('electoral-roll membership', () => {
    it('RV-08: throws ElectoralRollNotFoundError when the elector is not in the roll', async () => {
      electoralRolls.findByElectionAndElectorIds.mockResolvedValue([]);

      await expect(buildUseCase().execute(buildInput())).rejects.toBeInstanceOf(
        ElectoralRollNotFoundError,
      );
      expect(results.incrementVotes.mock.calls).toHaveLength(0);
    });
  });

  describe('candidacy validation', () => {
    it('RV-09: throws CandidacyNotFoundError when the candidacy is unknown', async () => {
      candidacies.findByElection.mockResolvedValue([buildCandidacy()]);

      await expect(
        buildUseCase().execute(buildInput({ candidacyId: 'candidacy-unknown' })),
      ).rejects.toBeInstanceOf(CandidacyNotFoundError);
      expect(results.incrementVotes.mock.calls).toHaveLength(0);
    });

    it('RV-10: rejects a candidacy that belongs to another election', async () => {
      candidacies.findByElection.mockResolvedValue([
        buildCandidacy({ id: 'candidacy-other', electionId: 'election-other' }),
      ]);

      await expect(
        buildUseCase().execute(buildInput({ candidacyId: 'candidacy-1' })),
      ).rejects.toBeInstanceOf(CandidacyNotFoundError);
      expect(results.incrementVotes.mock.calls).toHaveLength(0);
    });

    it('RV-11: rejects a candidacy whose candidate is INACTIVE (excluded from the ballot)', async () => {
      candidacies.findByElection.mockResolvedValue([]);

      await expect(buildUseCase().execute(buildInput())).rejects.toBeInstanceOf(
        CandidacyNotFoundError,
      );
      expect(results.incrementVotes.mock.calls).toHaveLength(0);
    });
  });

  describe('anonymity', () => {
    it('RV-12: never persists a link between the elector and the option', async () => {
      await buildUseCase().execute(buildInput());

      expect(results.incrementVotes.mock.calls).toStrictEqual([['election-1', 'candidacy-1']]);
      expect(JSON.stringify(results.incrementVotes.mock.calls[0])).not.toContain('elector-1');
    });
  });
});
