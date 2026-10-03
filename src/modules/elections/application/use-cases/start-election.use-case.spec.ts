import { ElectionEntity } from '../../domain/entities/election.entity';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import { ElectionStatusTransitionError } from '../../domain/errors/election-status-transition.error';
import { ElectionNotWithinScheduleError } from '../../domain/errors/election-not-within-schedule.error';
import { ElectionStartRequiresUserError } from '../../domain/errors/election-start-requires-user.error';
import { StartElectionUseCase } from './start-election.use-case';

// An eligible CREATED election (PENDING -> CREATED already happened),
// schedule window 2026-10-01 08:00:00Z .. 18:00:00Z.
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
    currentStatus: 'CREATED',
    blankVoteEnabled: false,
    createdAt: new Date('2026-08-19T15:00:00.000Z'),
    ...over,
  });
}

describe('StartElectionUseCase', () => {
  const elections: jest.Mocked<Pick<ElectionRepository, 'findById' | 'updateStatus'>> = {
    findById: jest.fn(),
    updateStatus: jest.fn(),
  };
  const audit: jest.Mocked<Pick<AuditLogPort, 'log'>> = {
    log: jest.fn(),
  };

  const NOW = new Date(Date.UTC(2026, 9, 1, 12, 0, 0)); // inside the window

  beforeEach(() => {
    jest.clearAllMocks();
    elections.findById.mockResolvedValue(buildElection());
    elections.updateStatus.mockResolvedValue(buildElection({ currentStatus: 'ACTIVE' }));
  });

  it('SE-01: starts a CREATED election inside the window, persists ACTIVE, and logs the audit entry', async () => {
    const result = await new StartElectionUseCase(elections, audit).execute({
      electionId: 'election-1',
      requestingUserId: 'admin-1',
      now: NOW,
    });

    // Guarded write: expectedCurrentStatus = CREATED makes the transition idempotent
    // and safe under concurrency (a loser never writes a duplicate history row).
    expect(elections.updateStatus.mock.calls[0]).toEqual([
      'election-1',
      'ACTIVE',
      'admin-1',
      'CREATED',
    ]);
    expect(audit.log.mock.calls).toHaveLength(1);
    expect(audit.log.mock.calls[0]).toEqual([
      'ELECTION_STATUS_CHANGED',
      'admin-1',
      { electionId: 'election-1', newStatus: 'ACTIVE' },
    ]);
    expect(result.currentStatus).toBe('ACTIVE');
  });

  it('SE-02: throws ElectionNotWithinScheduleError before the start instant and never writes', async () => {
    await expect(
      new StartElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: 'admin-1',
        now: new Date(Date.UTC(2026, 9, 1, 7, 59, 59)),
      }),
    ).rejects.toBeInstanceOf(ElectionNotWithinScheduleError);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('SE-03: throws ElectionNotWithinScheduleError after the end instant and never writes', async () => {
    await expect(
      new StartElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: 'admin-1',
        now: new Date(Date.UTC(2026, 9, 1, 18, 0, 1)),
      }),
    ).rejects.toBeInstanceOf(ElectionNotWithinScheduleError);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('SE-04: refuses to start a PENDING election (PENDING -> ACTIVE must be impossible)', async () => {
    elections.findById.mockResolvedValue(buildElection({ currentStatus: 'PENDING' }));

    await expect(
      new StartElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: 'admin-1',
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(ElectionStatusTransitionError);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('SE-05: throws ElectionStatusTransitionError for CLOSED and PUBLISHED, and refuses a silent restart of ACTIVE', async () => {
    for (const status of ['ACTIVE', 'CLOSED', 'PUBLISHED'] as const) {
      elections.findById.mockResolvedValue(buildElection({ currentStatus: status }));
      await expect(
        new StartElectionUseCase(elections, audit).execute({
          electionId: 'election-1',
          requestingUserId: 'admin-1',
          now: NOW,
        }),
      ).rejects.toBeInstanceOf(ElectionStatusTransitionError);
    }
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('SE-06a: throws ElectionNotFoundError when the election does not exist', async () => {
    elections.findById.mockResolvedValue(null);

    await expect(
      new StartElectionUseCase(elections, audit).execute({
        electionId: 'missing',
        requestingUserId: 'admin-1',
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(ElectionNotFoundError);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
  });

  it('SE-06b: throws ElectionStartRequiresUserError for an empty requestingUserId', async () => {
    await expect(
      new StartElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: '',
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(ElectionStartRequiresUserError);
    expect(elections.findById.mock.calls).toHaveLength(0);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
  });

  it('SE-07: accepts a now exactly at the start boundary (inclusive)', async () => {
    const result = await new StartElectionUseCase(elections, audit).execute({
      electionId: 'election-1',
      requestingUserId: 'admin-1',
      now: new Date(Date.UTC(2026, 9, 1, 8, 0, 0)),
    });

    expect(result.currentStatus).toBe('ACTIVE');
  });

  it('SE-08: accepts a now exactly at the end boundary (inclusive)', async () => {
    const result = await new StartElectionUseCase(elections, audit).execute({
      electionId: 'election-1',
      requestingUserId: 'admin-1',
      now: new Date(Date.UTC(2026, 9, 1, 18, 0, 0)),
    });

    expect(result.currentStatus).toBe('ACTIVE');
  });

  it('SE-09: surfaces a 409 (not a 404) when the guarded write loses the race', async () => {
    elections.updateStatus.mockResolvedValue(null);

    await expect(
      new StartElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: 'admin-1',
        now: NOW,
      }),
    ).rejects.toBeInstanceOf(ElectionStatusTransitionError);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('SE-10: does not consult roll or candidacy existence (those gates moved to finalize)', async () => {
    await new StartElectionUseCase(elections, audit).execute({
      electionId: 'election-1',
      requestingUserId: 'admin-1',
      now: NOW,
    });

    expect(elections).not.toHaveProperty('hasElectoralRoll');
    expect(elections).not.toHaveProperty('hasCandidates');
  });
});
