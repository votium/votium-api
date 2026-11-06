import { ElectionEntity } from '../../domain/entities/election.entity';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import { ElectionNotEndedError } from '../../domain/errors/election-not-ended.error';
import { ElectionStartRequiresUserError } from '../../domain/errors/election-start-requires-user.error';
import { ElectionStatusTransitionError } from '../../domain/errors/election-status-transition.error';
import { CloseElectionUseCase } from './close-election.use-case';

// An ACTIVE election, schedule window 2026-10-01 08:00:00Z .. 18:00:00Z.
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
    currentStatus: 'ACTIVE',
    blankVoteEnabled: false,
    createdAt: new Date('2026-08-19T15:00:00.000Z'),
    ...over,
  });
}

describe('CloseElectionUseCase', () => {
  const elections: jest.Mocked<Pick<ElectionRepository, 'findById' | 'updateStatus'>> = {
    findById: jest.fn(),
    updateStatus: jest.fn(),
  };
  const audit: jest.Mocked<Pick<AuditLogPort, 'log'>> = {
    log: jest.fn(),
  };

  const AT_END = new Date(Date.UTC(2026, 9, 1, 18, 0, 0)); // exactly at end_instant

  beforeEach(() => {
    jest.clearAllMocks();
    elections.findById.mockResolvedValue(buildElection());
    elections.updateStatus.mockResolvedValue(buildElection({ currentStatus: 'CLOSED' }));
  });

  it('CL-01: closes an ACTIVE election at the end instant, persists CLOSED, and logs the audit entry', async () => {
    const result = await new CloseElectionUseCase(elections, audit).execute({
      electionId: 'election-1',
      requestingUserId: 'admin-1',
      now: AT_END,
    });

    expect(elections.updateStatus.mock.calls[0]).toEqual([
      'election-1',
      'CLOSED',
      'admin-1',
      'ACTIVE',
    ]);
    expect(audit.log.mock.calls).toHaveLength(1);
    expect(audit.log.mock.calls[0]).toEqual([
      'ELECTION_STATUS_CHANGED',
      'admin-1',
      { electionId: 'election-1', newStatus: 'CLOSED' },
    ]);
    expect(result.currentStatus).toBe('CLOSED');
  });

  it('CL-02: throws ElectionNotEndedError when the end instant has not been reached', async () => {
    await expect(
      new CloseElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: 'admin-1',
        now: new Date(Date.UTC(2026, 9, 1, 17, 59, 59)),
      }),
    ).rejects.toBeInstanceOf(ElectionNotEndedError);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('CL-03: refuses to close any non-ACTIVE state, including CANCELLED and PUBLISHED', async () => {
    for (const status of ['PENDING', 'CREATED', 'CLOSED', 'PUBLISHED', 'CANCELLED'] as const) {
      elections.findById.mockResolvedValue(buildElection({ currentStatus: status }));

      await expect(
        new CloseElectionUseCase(elections, audit).execute({
          electionId: 'election-1',
          requestingUserId: 'admin-1',
          now: AT_END,
        }),
      ).rejects.toBeInstanceOf(ElectionStatusTransitionError);
    }
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('CL-04: throws ElectionNotFoundError when the election does not exist', async () => {
    elections.findById.mockResolvedValue(null);

    await expect(
      new CloseElectionUseCase(elections, audit).execute({
        electionId: 'missing',
        requestingUserId: 'admin-1',
        now: AT_END,
      }),
    ).rejects.toBeInstanceOf(ElectionNotFoundError);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
  });

  it('CL-05: throws ElectionStartRequiresUserError for an empty requestingUserId', async () => {
    await expect(
      new CloseElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: '',
        now: AT_END,
      }),
    ).rejects.toBeInstanceOf(ElectionStartRequiresUserError);
    expect(elections.findById.mock.calls).toHaveLength(0);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
  });

  it('CL-06: surfaces a 409 (not a 404) when the guarded write loses the race', async () => {
    elections.updateStatus.mockResolvedValue(null);

    await expect(
      new CloseElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: 'admin-1',
        now: AT_END,
      }),
    ).rejects.toBeInstanceOf(ElectionStatusTransitionError);
    expect(audit.log.mock.calls).toHaveLength(0);
  });
});
