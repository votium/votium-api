import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import {
  ElectionEntity,
  type ElectionStatus,
} from 'src/modules/elections/domain/entities/election.entity';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import { CandidacyEntity } from '../../domain/entities/candidacy.entity';
import { CandidacyNotFoundError } from '../../domain/errors/candidacy-not-found.error';
import { ElectionNotEligibleForCandidacyError } from '../../domain/errors/election-not-eligible-for-candidacy.error';
import type { CandidacyRepository } from '../../domain/repositories/candidacy.repository.interface';
import { DeleteCandidacyUseCase } from './delete-candidacy.use-case';

function buildElection(status: ElectionStatus): ElectionEntity {
  return ElectionEntity.restore({
    id: 'election-uuid',
    name: 'Test Election',
    description: 'desc',
    startDate: new Date('2026-09-01T00:00:00.000Z'),
    startTime: new Date('2026-09-01T08:00:00.000Z'),
    endDate: new Date('2026-09-01T00:00:00.000Z'),
    endTime: new Date('2026-09-01T18:00:00.000Z'),
    currentStatus: status,
    blankVoteEnabled: false,
    createdAt: new Date('2026-08-29T15:00:00.000Z'),
  });
}

function buildCandidacy(overrides: { electionId?: string } = {}): CandidacyEntity {
  return CandidacyEntity.restore({
    id: 'candidacy-uuid',
    electionId: overrides.electionId ?? 'election-uuid',
    candidateId: 'candidate-uuid',
    positionNumber: 2,
    imageUrl: null,
    createdAt: new Date('2026-08-29T15:00:00.000Z'),
  });
}

describe('DeleteCandidacyUseCase', () => {
  let elections: jest.Mocked<ElectionRepository>;
  let candidacies: jest.Mocked<CandidacyRepository>;
  let audit: jest.Mocked<Pick<AuditLogPort, 'log'>>;

  beforeEach(() => {
    elections = {
      findAll: jest.fn(),
      create: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      updateStatus: jest.fn(),
      hasCandidates: jest.fn(),
      hasVotes: jest.fn(),
      delete: jest.fn(),
    };
    candidacies = {
      findUsedPositions: jest.fn(),
      create: jest.fn(),
      findByElection: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      deleteByElectionAndCandidacyId: jest.fn(),
    };
    audit = { log: jest.fn() };
    jest.clearAllMocks();
  });

  function buildUseCase(): DeleteCandidacyUseCase {
    return new DeleteCandidacyUseCase(elections, candidacies, audit);
  }

  const baseInput = {
    electionId: 'election-uuid',
    candidacyId: 'candidacy-uuid',
    requestingUserId: 'admin-uuid',
  };

  it('DC-01: deletes the candidacy via the composite-scoped repo call and logs CANDIDACY_DELETED', async () => {
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    candidacies.findById.mockResolvedValue(buildCandidacy());
    candidacies.deleteByElectionAndCandidacyId.mockResolvedValue(true);

    await buildUseCase().execute(baseInput);

    expect(candidacies.deleteByElectionAndCandidacyId.mock.calls).toStrictEqual([
      ['election-uuid', 'candidacy-uuid'],
    ]);
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith('CANDIDACY_DELETED', 'admin-uuid', {
      electionId: 'election-uuid',
      candidacyId: 'candidacy-uuid',
      candidateId: 'candidate-uuid',
    });
    expect(candidacies.create.mock.calls).toHaveLength(0);
    expect(candidacies.update.mock.calls).toHaveLength(0);
  });

  it('DC-02: throws ElectionNotFoundError when the election does not exist', async () => {
    elections.findById.mockResolvedValue(null);

    await expect(buildUseCase().execute(baseInput)).rejects.toBeInstanceOf(ElectionNotFoundError);
    expect(candidacies.findById.mock.calls).toHaveLength(0);
    expect(candidacies.deleteByElectionAndCandidacyId.mock.calls).toHaveLength(0);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it.each(['CREATED', 'PUBLISHED', 'ACTIVE', 'CLOSED'] as const)(
    'DC-03: throws ElectionNotEligibleForCandidacyError for a %s election before looking up the candidacy',
    async (status) => {
      elections.findById.mockResolvedValue(buildElection(status));

      await expect(buildUseCase().execute(baseInput)).rejects.toBeInstanceOf(
        ElectionNotEligibleForCandidacyError,
      );
      // The pending check must happen before the candidacy lookup: a candidacy
      // from a non-pending election is never even searched.
      expect(candidacies.findById.mock.calls).toHaveLength(0);
      expect(candidacies.deleteByElectionAndCandidacyId.mock.calls).toHaveLength(0);
      expect(audit.log).not.toHaveBeenCalled();
    },
  );

  it('DC-04: throws CandidacyNotFoundError when the candidacy does not exist', async () => {
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    candidacies.findById.mockResolvedValue(null);

    await expect(buildUseCase().execute(baseInput)).rejects.toBeInstanceOf(CandidacyNotFoundError);
    expect(candidacies.deleteByElectionAndCandidacyId.mock.calls).toHaveLength(0);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('DC-05: throws CandidacyNotFoundError when the candidacy belongs to another election', async () => {
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    candidacies.findById.mockResolvedValue(buildCandidacy({ electionId: 'other-election' }));

    await expect(buildUseCase().execute(baseInput)).rejects.toBeInstanceOf(CandidacyNotFoundError);
    expect(candidacies.deleteByElectionAndCandidacyId.mock.calls).toHaveLength(0);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('DC-06: throws CandidacyNotFoundError when the row vanishes between read and delete', async () => {
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    candidacies.findById.mockResolvedValue(buildCandidacy());
    candidacies.deleteByElectionAndCandidacyId.mockResolvedValue(false);

    await expect(buildUseCase().execute(baseInput)).rejects.toBeInstanceOf(CandidacyNotFoundError);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('DC-07: deletes but skips the audit log when requestingUserId is empty', async () => {
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    candidacies.findById.mockResolvedValue(buildCandidacy());
    candidacies.deleteByElectionAndCandidacyId.mockResolvedValue(true);

    await buildUseCase().execute({ ...baseInput, requestingUserId: '' });

    expect(candidacies.deleteByElectionAndCandidacyId.mock.calls).toHaveLength(1);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('DC-08: propagates an unexpected delete failure unchanged', async () => {
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    candidacies.findById.mockResolvedValue(buildCandidacy());
    candidacies.deleteByElectionAndCandidacyId.mockRejectedValue(new Error('database exploded'));

    await expect(buildUseCase().execute(baseInput)).rejects.toThrow('database exploded');
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('DC-09: propagates an unexpected election lookup failure unchanged and never deletes', async () => {
    elections.findById.mockRejectedValue(new Error('database exploded'));

    await expect(buildUseCase().execute(baseInput)).rejects.toThrow('database exploded');
    expect(candidacies.findById.mock.calls).toHaveLength(0);
    expect(candidacies.deleteByElectionAndCandidacyId.mock.calls).toHaveLength(0);
    expect(audit.log).not.toHaveBeenCalled();
  });
});
