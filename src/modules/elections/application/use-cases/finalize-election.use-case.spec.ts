import { ElectionEntity } from '../../domain/entities/election.entity';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import { ElectionStatusTransitionError } from '../../domain/errors/election-status-transition.error';
import { ElectionMissingElectoralRollError } from '../../domain/errors/election-missing-electoral-roll.error';
import { ElectionNoCandidatesError } from '../../domain/errors/election-no-candidates.error';
import { FinalizeElectionUseCase } from './finalize-election.use-case';

// A PENDING election in its initial configuration state.
function buildElection(
  over: Partial<Parameters<typeof ElectionEntity.restore>[0]> = {},
): ElectionEntity {
  return ElectionEntity.restore({
    id: 'election-1',
    name: 'Student Council Election 2026',
    description: 'Election for the 2026 student council.',
    startDate: new Date(Date.UTC(2026, 9, 1)),
    startTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
    endDate: new Date(Date.UTC(2026, 9, 1)),
    endTime: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
    currentStatus: 'PENDING',
    blankVoteEnabled: false,
    createdAt: new Date('2026-08-19T15:00:00.000Z'),
    ...over,
  });
}

describe('FinalizeElectionUseCase', () => {
  const elections: jest.Mocked<
    Pick<ElectionRepository, 'findById' | 'updateStatus' | 'hasElectoralRoll' | 'hasCandidates'>
  > = {
    findById: jest.fn(),
    updateStatus: jest.fn(),
    hasElectoralRoll: jest.fn(),
    hasCandidates: jest.fn(),
  };
  const audit: jest.Mocked<Pick<AuditLogPort, 'log'>> = {
    log: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    elections.findById.mockResolvedValue(buildElection());
    elections.hasElectoralRoll.mockResolvedValue(true);
    elections.hasCandidates.mockResolvedValue(true);
    elections.updateStatus.mockResolvedValue(buildElection({ currentStatus: 'CREATED' }));
  });

  it('FE-01: finalizes a PENDING election with roll and candidates, persists CREATED, and logs the audit entry', async () => {
    const result = await new FinalizeElectionUseCase(elections, audit).execute({
      electionId: 'election-1',
      requestingUserId: 'admin-1',
    });

    expect(elections.updateStatus.mock.calls[0]).toEqual([
      'election-1',
      'CREATED',
      'admin-1',
      'PENDING',
    ]);
    expect(audit.log.mock.calls).toHaveLength(1);
    expect(audit.log.mock.calls[0]).toEqual([
      'ELECTION_STATUS_CHANGED',
      'admin-1',
      { electionId: 'election-1', newStatus: 'CREATED' },
    ]);
    expect(result.currentStatus).toBe('CREATED');
  });

  it('FE-02: does NOT require being inside the schedule window (finalization is not activation)', async () => {
    // Far outside the 2026-10-01 window: still finalizes.
    const result = await new FinalizeElectionUseCase(elections, audit).execute({
      electionId: 'election-1',
      requestingUserId: 'admin-1',
    });

    expect(result.currentStatus).toBe('CREATED');
    expect(elections.updateStatus.mock.calls).toHaveLength(1);
  });

  it('FE-03a: throws ElectionMissingElectoralRollError without a roll and never checks candidates', async () => {
    elections.hasElectoralRoll.mockResolvedValue(false);

    await expect(
      new FinalizeElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: 'admin-1',
      }),
    ).rejects.toBeInstanceOf(ElectionMissingElectoralRollError);
    expect(elections.hasCandidates.mock.calls).toHaveLength(0);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('FE-03b: throws ElectionNoCandidatesError without registered candidacies', async () => {
    elections.hasCandidates.mockResolvedValue(false);

    await expect(
      new FinalizeElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: 'admin-1',
      }),
    ).rejects.toBeInstanceOf(ElectionNoCandidatesError);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('FE-04: refuses every non-PENDING status, including a repeated finalization of CREATED (409)', async () => {
    for (const status of ['CREATED', 'ACTIVE', 'CLOSED', 'PUBLISHED'] as const) {
      elections.findById.mockResolvedValue(buildElection({ currentStatus: status }));

      await expect(
        new FinalizeElectionUseCase(elections, audit).execute({
          electionId: 'election-1',
          requestingUserId: 'admin-1',
        }),
      ).rejects.toBeInstanceOf(ElectionStatusTransitionError);
    }
    // Repeated finalize must be non-idempotent (D5): no second CREATED→CREATED write.
    expect(elections.hasElectoralRoll.mock.calls).toHaveLength(0);
    expect(elections.hasCandidates.mock.calls).toHaveLength(0);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('FE-05a: throws ElectionNotFoundError when the election does not exist', async () => {
    elections.findById.mockResolvedValue(null);

    await expect(
      new FinalizeElectionUseCase(elections, audit).execute({
        electionId: 'missing',
        requestingUserId: 'admin-1',
      }),
    ).rejects.toBeInstanceOf(ElectionNotFoundError);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
  });

  it('FE-05b: surfaces a 409 (not a 404) when the guarded write loses the race', async () => {
    elections.updateStatus.mockResolvedValue(null);

    await expect(
      new FinalizeElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: 'admin-1',
      }),
    ).rejects.toBeInstanceOf(ElectionStatusTransitionError);
    expect(audit.log.mock.calls).toHaveLength(0);
  });
});
