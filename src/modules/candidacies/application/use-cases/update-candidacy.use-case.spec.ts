import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import {
  ElectionEntity,
  type ElectionStatus,
} from 'src/modules/elections/domain/entities/election.entity';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import { CandidacyEntity } from '../../domain/entities/candidacy.entity';
import { CandidacyDuplicateError } from '../../domain/errors/candidacy-duplicate.error';
import { CandidacyNotFoundError } from '../../domain/errors/candidacy-not-found.error';
import { ElectionNotEligibleForCandidacyError } from '../../domain/errors/election-not-eligible-for-candidacy.error';
import type { CandidacyRepository } from '../../domain/repositories/candidacy.repository.interface';
import { UpdateCandidacyUseCase } from './update-candidacy.use-case';

type CandidacyOverrides = { positionNumber?: number; imageUrl?: string | null };

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

function buildCandidacy(overrides: CandidacyOverrides = {}): CandidacyEntity {
  return CandidacyEntity.restore({
    id: 'candidacy-uuid',
    electionId: 'election-uuid',
    candidateId: 'candidate-uuid',
    positionNumber: overrides.positionNumber ?? 1,
    imageUrl:
      overrides.imageUrl === undefined ? 'https://example.com/photo.png' : overrides.imageUrl,
    createdAt: new Date('2026-08-29T15:00:00.000Z'),
  });
}

function buildUpdated(overrides: CandidacyOverrides = {}): CandidacyEntity {
  return buildCandidacy(overrides);
}

describe('UpdateCandidacyUseCase', () => {
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
      findMaxPosition: jest.fn(),
      create: jest.fn(),
      findByElection: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
    };
    audit = { log: jest.fn() };
    jest.clearAllMocks();
  });

  function buildUseCase(): UpdateCandidacyUseCase {
    return new UpdateCandidacyUseCase(elections, candidacies, audit);
  }

  it('UC-01: updates the positionNumber and returns the persisted entity', async () => {
    const updated = buildUpdated({ positionNumber: 3 });
    candidacies.findById.mockResolvedValue(buildCandidacy());
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    candidacies.update.mockResolvedValue(updated);

    const result = await buildUseCase().execute({
      id: 'candidacy-uuid',
      data: { positionNumber: 3 },
      requestingUserId: 'admin-uuid',
    });

    expect(result).toBe(updated);
    expect(candidacies.update.mock.calls).toStrictEqual([
      ['candidacy-uuid', { positionNumber: 3 }],
    ]);
  });

  it('UC-02: updates the imageUrl', async () => {
    candidacies.findById.mockResolvedValue(buildCandidacy());
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    candidacies.update.mockResolvedValue(buildUpdated({ imageUrl: 'https://example.com/new.png' }));

    await buildUseCase().execute({
      id: 'candidacy-uuid',
      data: { imageUrl: 'https://example.com/new.png' },
      requestingUserId: 'admin-uuid',
    });

    expect(candidacies.update.mock.calls).toStrictEqual([
      ['candidacy-uuid', { imageUrl: 'https://example.com/new.png' }],
    ]);
  });

  it('UC-03: a partial update forwards only the provided positionNumber', async () => {
    candidacies.findById.mockResolvedValue(buildCandidacy());
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    candidacies.update.mockResolvedValue(buildUpdated({ positionNumber: 3 }));

    await buildUseCase().execute({
      id: 'candidacy-uuid',
      data: { positionNumber: 3 },
      requestingUserId: 'admin-uuid',
    });

    expect(candidacies.update.mock.calls).toStrictEqual([
      ['candidacy-uuid', { positionNumber: 3 }],
    ]);
    const forwarded = candidacies.update.mock.calls[0][1];
    expect(forwarded.imageUrl).toBeUndefined();
  });

  it('UC-04: imageUrl null is forwarded to the repository (clearing semantics)', async () => {
    candidacies.findById.mockResolvedValue(buildCandidacy());
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    candidacies.update.mockResolvedValue(buildUpdated({ imageUrl: null }));

    await buildUseCase().execute({
      id: 'candidacy-uuid',
      data: { imageUrl: null },
      requestingUserId: 'admin-uuid',
    });

    expect(candidacies.update.mock.calls).toStrictEqual([['candidacy-uuid', { imageUrl: null }]]);
  });

  it('UC-05: an empty input still validates the election state and runs a no-op update', async () => {
    candidacies.findById.mockResolvedValue(buildCandidacy());
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    candidacies.update.mockResolvedValue(buildCandidacy());

    const result = await buildUseCase().execute({
      id: 'candidacy-uuid',
      data: {},
      requestingUserId: 'admin-uuid',
    });

    expect(result.positionNumber).toBe(1);
    expect(candidacies.update.mock.calls).toStrictEqual([['candidacy-uuid', {}]]);
  });

  it('UC-06: throws CandidacyNotFoundError when the candidacy does not exist', async () => {
    candidacies.findById.mockResolvedValue(null);

    await expect(
      buildUseCase().execute({
        id: 'missing',
        data: { positionNumber: 3 },
        requestingUserId: 'admin-uuid',
      }),
    ).rejects.toBeInstanceOf(CandidacyNotFoundError);

    expect(elections.findById.mock.calls).toHaveLength(0);
    expect(candidacies.update.mock.calls).toHaveLength(0);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('UC-07: throws ElectionNotFoundError when the associated election is missing', async () => {
    candidacies.findById.mockResolvedValue(buildCandidacy());
    elections.findById.mockResolvedValue(null);

    await expect(
      buildUseCase().execute({
        id: 'candidacy-uuid',
        data: { positionNumber: 3 },
        requestingUserId: 'admin-uuid',
      }),
    ).rejects.toBeInstanceOf(ElectionNotFoundError);

    expect(candidacies.update.mock.calls).toHaveLength(0);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it.each(['CREATED', 'PUBLISHED', 'ACTIVE', 'CLOSED'] as const)(
    'UC-08: throws ElectionNotEligibleForCandidacyError for a %s election',
    async (status) => {
      candidacies.findById.mockResolvedValue(buildCandidacy());
      elections.findById.mockResolvedValue(buildElection(status));

      await expect(
        buildUseCase().execute({
          id: 'candidacy-uuid',
          data: { positionNumber: 3 },
          requestingUserId: 'admin-uuid',
        }),
      ).rejects.toBeInstanceOf(ElectionNotEligibleForCandidacyError);

      expect(candidacies.update.mock.calls).toHaveLength(0);
      expect(audit.log).not.toHaveBeenCalled();
    },
  );

  it('UC-09: rejects an empty update when the election is not pending', async () => {
    candidacies.findById.mockResolvedValue(buildCandidacy());
    elections.findById.mockResolvedValue(buildElection('PUBLISHED'));

    await expect(
      buildUseCase().execute({
        id: 'candidacy-uuid',
        data: {},
        requestingUserId: 'admin-uuid',
      }),
    ).rejects.toBeInstanceOf(ElectionNotEligibleForCandidacyError);

    expect(candidacies.update.mock.calls).toHaveLength(0);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('UC-10: throws CandidacyNotFoundError when the row vanishes between read and write', async () => {
    candidacies.findById.mockResolvedValue(buildCandidacy());
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    candidacies.update.mockResolvedValue(null);

    await expect(
      buildUseCase().execute({
        id: 'candidacy-uuid',
        data: { positionNumber: 3 },
        requestingUserId: 'admin-uuid',
      }),
    ).rejects.toBeInstanceOf(CandidacyNotFoundError);

    expect(audit.log).not.toHaveBeenCalled();
  });

  it('UC-11: propagates CandidacyDuplicateError on a unique constraint violation', async () => {
    candidacies.findById.mockResolvedValue(buildCandidacy());
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    candidacies.update.mockRejectedValue(new CandidacyDuplicateError());

    await expect(
      buildUseCase().execute({
        id: 'candidacy-uuid',
        data: { positionNumber: 2 },
        requestingUserId: 'admin-uuid',
      }),
    ).rejects.toBeInstanceOf(CandidacyDuplicateError);

    expect(audit.log).not.toHaveBeenCalled();
  });

  it('UC-12a: propagates unexpected lookup failures unchanged', async () => {
    candidacies.findById.mockRejectedValue(new Error('database exploded'));

    await expect(
      buildUseCase().execute({
        id: 'candidacy-uuid',
        data: { positionNumber: 3 },
        requestingUserId: 'admin-uuid',
      }),
    ).rejects.toThrow('database exploded');
  });

  it('UC-12b: propagates unexpected persistence failures unchanged', async () => {
    candidacies.findById.mockResolvedValue(buildCandidacy());
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    candidacies.update.mockRejectedValue(new Error('database exploded'));

    await expect(
      buildUseCase().execute({
        id: 'candidacy-uuid',
        data: { positionNumber: 3 },
        requestingUserId: 'admin-uuid',
      }),
    ).rejects.toThrow('database exploded');
  });

  it('UC-13: records an audit entry with CANDIDACY_UPDATED on success', async () => {
    candidacies.findById.mockResolvedValue(buildCandidacy());
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    candidacies.update.mockResolvedValue(buildUpdated({ positionNumber: 3 }));

    await buildUseCase().execute({
      id: 'candidacy-uuid',
      data: { positionNumber: 3 },
      requestingUserId: 'admin-uuid',
    });

    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith('CANDIDACY_UPDATED', 'admin-uuid', {
      candidacyId: 'candidacy-uuid',
      electionId: 'election-uuid',
      candidateId: 'candidate-uuid',
    });
  });

  it('UC-14: skips the audit log when requestingUserId is empty', async () => {
    candidacies.findById.mockResolvedValue(buildCandidacy());
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    candidacies.update.mockResolvedValue(buildUpdated({ positionNumber: 3 }));

    await buildUseCase().execute({
      id: 'candidacy-uuid',
      data: { positionNumber: 3 },
      requestingUserId: '',
    });

    expect(audit.log).not.toHaveBeenCalled();
  });

  it('UC-15: mutates the entity and checks the election state before persisting', async () => {
    const existing = buildCandidacy();
    const updateSpy = jest.spyOn(existing, 'update');
    candidacies.findById.mockResolvedValue(existing);
    elections.findById.mockResolvedValue(buildElection('PENDING'));
    candidacies.update.mockResolvedValue(buildUpdated({ positionNumber: 3 }));

    await buildUseCase().execute({
      id: 'candidacy-uuid',
      data: { positionNumber: 3 },
      requestingUserId: 'admin-uuid',
    });

    expect(updateSpy).toHaveBeenCalledWith({ positionNumber: 3 });
    expect(elections.findById.mock.invocationCallOrder[0]).toBeLessThan(
      (candidacies.update as jest.Mock).mock.invocationCallOrder[0],
    );
    expect(updateSpy.mock.invocationCallOrder[0]).toBeLessThan(
      (candidacies.update as jest.Mock).mock.invocationCallOrder[0],
    );
  });
});
