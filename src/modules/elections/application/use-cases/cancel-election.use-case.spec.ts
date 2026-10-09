import { ElectionEntity } from '../../domain/entities/election.entity';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import { ElectionStartRequiresUserError } from '../../domain/errors/election-start-requires-user.error';
import { ElectionStatusTransitionError } from '../../domain/errors/election-status-transition.error';
import { CancelElectionUseCase } from './cancel-election.use-case';

// Any non-terminal state may be cancelled; PENDING is the default fixture.
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

describe('CancelElectionUseCase', () => {
  const elections: jest.Mocked<Pick<ElectionRepository, 'findById' | 'updateStatus'>> = {
    findById: jest.fn(),
    updateStatus: jest.fn(),
  };
  const audit: jest.Mocked<Pick<AuditLogPort, 'log'>> = {
    log: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    elections.findById.mockResolvedValue(buildElection());
    elections.updateStatus.mockResolvedValue(buildElection({ currentStatus: 'CANCELLED' }));
  });

  it('CA-01: cancels any non-terminal state, persists CANCELLED, and logs the audit entry', async () => {
    const cancellable = ['PENDING', 'CREATED', 'ACTIVE', 'CLOSED'] as const;

    for (const source of cancellable) {
      elections.findById.mockResolvedValue(buildElection({ currentStatus: source }));

      const result = await new CancelElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: 'admin-1',
      });

      // The guarded write is keyed on the *actual* source status read above.
      expect(elections.updateStatus).toHaveBeenLastCalledWith(
        'election-1',
        'CANCELLED',
        'admin-1',
        source,
      );
      expect(result.currentStatus).toBe('CANCELLED');
    }

    expect(audit.log.mock.calls).toHaveLength(4);
    expect(audit.log.mock.calls[0]).toEqual([
      'ELECTION_STATUS_CHANGED',
      'admin-1',
      { electionId: 'election-1', newStatus: 'CANCELLED' },
    ]);
  });

  it('CA-02: refuses to cancel a PUBLISHED election (terminal)', async () => {
    elections.findById.mockResolvedValue(buildElection({ currentStatus: 'PUBLISHED' }));

    await expect(
      new CancelElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: 'admin-1',
      }),
    ).rejects.toBeInstanceOf(ElectionStatusTransitionError);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('CA-03: repeated cancellation of an already-cancelled election is refused (no duplicate history)', async () => {
    elections.findById.mockResolvedValue(buildElection({ currentStatus: 'CANCELLED' }));

    await expect(
      new CancelElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: 'admin-1',
      }),
    ).rejects.toBeInstanceOf(ElectionStatusTransitionError);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('CA-04: throws ElectionNotFoundError when the election does not exist', async () => {
    elections.findById.mockResolvedValue(null);

    await expect(
      new CancelElectionUseCase(elections, audit).execute({
        electionId: 'missing',
        requestingUserId: 'admin-1',
      }),
    ).rejects.toBeInstanceOf(ElectionNotFoundError);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
  });

  it('CA-05: throws ElectionStartRequiresUserError for an empty requestingUserId', async () => {
    await expect(
      new CancelElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: '',
      }),
    ).rejects.toBeInstanceOf(ElectionStartRequiresUserError);
    expect(elections.findById.mock.calls).toHaveLength(0);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
  });

  it('CA-06: surfaces a 409 (not a 404) when the guarded write loses the race', async () => {
    elections.updateStatus.mockResolvedValue(null);

    await expect(
      new CancelElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: 'admin-1',
      }),
    ).rejects.toBeInstanceOf(ElectionStatusTransitionError);
    expect(audit.log.mock.calls).toHaveLength(0);
  });
});
