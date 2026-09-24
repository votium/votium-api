import { ElectionEntity } from '../../domain/entities/election.entity';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import { ElectionStatusTransitionError } from '../../domain/errors/election-status-transition.error';
import { ElectionNotWithinScheduleError } from '../../domain/errors/election-not-within-schedule.error';
import { ElectionMissingElectoralRollError } from '../../domain/errors/election-missing-electoral-roll.error';
import { ElectionNoCandidatesError } from '../../domain/errors/election-no-candidates.error';
import { ElectionStartRequiresUserError } from '../../domain/errors/election-start-requires-user.error';
import { StartElectionUseCase } from './start-election.use-case';

// Eligible PENDING election, schedule window 2026-10-01 08:00:00Z .. 18:00:00Z.
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

describe('StartElectionUseCase', () => {
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
  const audit: jest.Mocked<Pick<AuditLogPort, 'log'>> = {
    log: jest.fn(),
  };

  const NOW = new Date(Date.UTC(2026, 9, 1, 12, 0, 0)); // inside the window

  beforeEach(() => {
    jest.clearAllMocks();
    elections.findById.mockResolvedValue(buildElection());
    elections.hasElectoralRoll.mockResolvedValue(true);
    elections.hasCandidates.mockResolvedValue(true);
    elections.updateStatus.mockResolvedValue(buildElection({ currentStatus: 'ACTIVE' }));
  });

  it('UC-1: starts an eligible PENDING election, persists ACTIVE, and logs the audit entry', async () => {
    const result = await new StartElectionUseCase(elections, audit).execute({
      electionId: 'election-1',
      requestingUserId: 'admin-1',
      now: NOW,
    });

    expect(elections.updateStatus.mock.calls).toHaveLength(1);
    expect(elections.updateStatus.mock.calls[0]).toEqual(['election-1', 'ACTIVE', 'admin-1']);
    expect(audit.log.mock.calls).toHaveLength(1);
    expect(audit.log.mock.calls[0]).toEqual([
      'ELECTION_STATUS_CHANGED',
      'admin-1',
      { electionId: 'election-1', newStatus: 'ACTIVE' },
    ]);
    expect(result.currentStatus).toBe('ACTIVE');
  });

  it('UC-2: throws ElectionNotFoundError when the election does not exist', async () => {
    elections.findById.mockResolvedValue(null);

    await expect(
      new StartElectionUseCase(elections, audit).execute({
        electionId: 'missing',
        requestingUserId: 'admin-1',
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(ElectionNotFoundError);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('UC-3: throws ElectionStatusTransitionError for every non-PENDING status and never updates', async () => {
    for (const status of ['CREATED', 'PUBLISHED', 'CLOSED', 'ACTIVE'] as const) {
      elections.findById.mockResolvedValue(buildElection({ currentStatus: status }));
      await expect(
        new StartElectionUseCase(elections, audit).execute({
          electionId: 'election-1',
          requestingUserId: 'admin-1',
          now: NOW,
        }),
      ).rejects.toBeInstanceOf(ElectionStatusTransitionError);
    }
    expect(elections.hasElectoralRoll.mock.calls).toHaveLength(0);
    expect(elections.hasCandidates.mock.calls).toHaveLength(0);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('UC-4: throws ElectionNotWithinScheduleError before the start instant and never checks the roll', async () => {
    await expect(
      new StartElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: 'admin-1',
        now: new Date(Date.UTC(2026, 9, 1, 7, 59, 59)),
      }),
    ).rejects.toBeInstanceOf(ElectionNotWithinScheduleError);
    expect(elections.hasElectoralRoll.mock.calls).toHaveLength(0);
    expect(elections.hasCandidates.mock.calls).toHaveLength(0);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
  });

  it('UC-5: throws ElectionNotWithinScheduleError after the end instant with no write-path calls', async () => {
    await expect(
      new StartElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: 'admin-1',
        now: new Date(Date.UTC(2026, 9, 1, 18, 0, 1)),
      }),
    ).rejects.toBeInstanceOf(ElectionNotWithinScheduleError);
    expect(elections.hasElectoralRoll.mock.calls).toHaveLength(0);
    expect(elections.hasCandidates.mock.calls).toHaveLength(0);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
  });

  it('UC-6: accepts a now exactly at the start boundary (inclusive)', async () => {
    const result = await new StartElectionUseCase(elections, audit).execute({
      electionId: 'election-1',
      requestingUserId: 'admin-1',
      now: new Date(Date.UTC(2026, 9, 1, 8, 0, 0)),
    });

    expect(elections.updateStatus.mock.calls).toHaveLength(1);
    expect(result.currentStatus).toBe('ACTIVE');
  });

  it('UC-7: accepts a now exactly at the end boundary (inclusive)', async () => {
    const result = await new StartElectionUseCase(elections, audit).execute({
      electionId: 'election-1',
      requestingUserId: 'admin-1',
      now: new Date(Date.UTC(2026, 9, 1, 18, 0, 0)),
    });

    expect(elections.updateStatus.mock.calls).toHaveLength(1);
    expect(result.currentStatus).toBe('ACTIVE');
  });

  it('UC-8: throws ElectionMissingElectoralRollError without a roll and never checks candidates', async () => {
    elections.hasElectoralRoll.mockResolvedValue(false);

    await expect(
      new StartElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: 'admin-1',
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(ElectionMissingElectoralRollError);
    expect(elections.hasCandidates.mock.calls).toHaveLength(0);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('UC-9: throws ElectionNoCandidatesError without registered candidacies and never updates', async () => {
    elections.hasCandidates.mockResolvedValue(false);

    await expect(
      new StartElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: 'admin-1',
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(ElectionNoCandidatesError);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('UC-10: throws ElectionNotFoundError when updateStatus resolves null (concurrent delete)', async () => {
    elections.updateStatus.mockResolvedValue(null);

    await expect(
      new StartElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: 'admin-1',
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(ElectionNotFoundError);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('UC-11: throws ElectionStartRequiresUserError for an empty requestingUserId and never touches the persistence layer', async () => {
    await expect(
      new StartElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: '',
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(ElectionStartRequiresUserError);

    // Fails before any repository/audit call: ElectionStatusHistory.user_id is a
    // NOT NULL FK, so an empty actor could never produce a valid history row.
    expect(elections.findById.mock.calls).toHaveLength(0);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('UC-12: fail-fast ordering - later checks never run when an earlier rule fails', async () => {
    // (a) non-PENDING => hasElectoralRoll never called.
    elections.findById.mockResolvedValue(buildElection({ currentStatus: 'PUBLISHED' }));
    await expect(
      new StartElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: 'admin-1',
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(ElectionStatusTransitionError);
    expect(elections.hasElectoralRoll.mock.calls).toHaveLength(0);

    // (b) out-of-window => hasElectoralRoll never called.
    elections.findById.mockResolvedValue(buildElection());
    elections.hasElectoralRoll.mockClear();
    await expect(
      new StartElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: 'admin-1',
        now: new Date(Date.UTC(2026, 9, 1, 18, 0, 1)),
      }),
    ).rejects.toBeInstanceOf(ElectionNotWithinScheduleError);
    expect(elections.hasElectoralRoll.mock.calls).toHaveLength(0);

    // (c) no-roll => hasCandidates never called.
    elections.hasElectoralRoll.mockResolvedValue(false);
    await expect(
      new StartElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: 'admin-1',
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(ElectionMissingElectoralRollError);
    expect(elections.hasCandidates.mock.calls).toHaveLength(0);

    expect(elections.updateStatus.mock.calls).toHaveLength(0);
  });

  it('UC-13: propagates a repository failure unchanged and never updates', async () => {
    elections.hasElectoralRoll.mockRejectedValue(new Error('database exploded'));

    await expect(
      new StartElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: 'admin-1',
        now: NOW,
      }),
    ).rejects.toThrow('database exploded');
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('UC-14: propagates an updateStatus failure unchanged and does not log audit', async () => {
    elections.updateStatus.mockRejectedValue(new Error('database exploded'));

    await expect(
      new StartElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: 'admin-1',
        now: NOW,
      }),
    ).rejects.toThrow('database exploded');
    expect(audit.log.mock.calls).toHaveLength(0);
  });
});
