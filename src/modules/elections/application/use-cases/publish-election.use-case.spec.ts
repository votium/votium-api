import { ElectionEntity } from '../../domain/entities/election.entity';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import { ElectionStatusTransitionError } from '../../domain/errors/election-status-transition.error';
import { PublishElectionUseCase } from './publish-election.use-case';

// A CLOSED election, the only status from which publication is allowed.
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
    currentStatus: 'CLOSED',
    blankVoteEnabled: false,
    createdAt: new Date('2026-08-19T15:00:00.000Z'),
    ...over,
  });
}

describe('PublishElectionUseCase', () => {
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
    elections.updateStatus.mockResolvedValue(buildElection({ currentStatus: 'PUBLISHED' }));
  });

  it('PE-01: publishes a CLOSED election, persists PUBLISHED, and logs the audit entry', async () => {
    const result = await new PublishElectionUseCase(elections, audit).execute({
      electionId: 'election-1',
      requestingUserId: 'admin-1',
    });

    expect(elections.updateStatus.mock.calls[0]).toEqual([
      'election-1',
      'PUBLISHED',
      'admin-1',
      'CLOSED',
    ]);
    expect(audit.log.mock.calls).toHaveLength(1);
    expect(audit.log.mock.calls[0]).toEqual([
      'ELECTION_STATUS_CHANGED',
      'admin-1',
      { electionId: 'election-1', newStatus: 'PUBLISHED' },
    ]);
    expect(result.currentStatus).toBe('PUBLISHED');
  });

  it('PE-02: requires no electoral roll and no candidacies (D2: CLOSED is the only prerequisite)', async () => {
    // findById alone is consulted; the entity's static contract exposes no such checks.
    const result = await new PublishElectionUseCase(elections, audit).execute({
      electionId: 'election-1',
      requestingUserId: 'admin-1',
    });

    expect(elections).not.toHaveProperty('hasElectoralRoll');
    expect(elections).not.toHaveProperty('hasCandidates');
    expect(result.currentStatus).toBe('PUBLISHED');
  });

  it('PE-03a: refuses to publish a CREATED election (must close first)', async () => {
    elections.findById.mockResolvedValue(buildElection({ currentStatus: 'CREATED' }));

    await expect(
      new PublishElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: 'admin-1',
      }),
    ).rejects.toBeInstanceOf(ElectionStatusTransitionError);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('PE-03b: refuses every other status, including a repeated publication of PUBLISHED (409)', async () => {
    for (const status of ['PENDING', 'ACTIVE', 'PUBLISHED'] as const) {
      elections.findById.mockResolvedValue(buildElection({ currentStatus: status }));

      await expect(
        new PublishElectionUseCase(elections, audit).execute({
          electionId: 'election-1',
          requestingUserId: 'admin-1',
        }),
      ).rejects.toBeInstanceOf(ElectionStatusTransitionError);
    }
    // Repeated publish must be non-idempotent (D5).
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('PE-04a: throws ElectionNotFoundError when the election does not exist', async () => {
    elections.findById.mockResolvedValue(null);

    await expect(
      new PublishElectionUseCase(elections, audit).execute({
        electionId: 'missing',
        requestingUserId: 'admin-1',
      }),
    ).rejects.toBeInstanceOf(ElectionNotFoundError);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
  });

  it('PE-04b: surfaces a 409 (not a 404) when the guarded write loses the race', async () => {
    elections.updateStatus.mockResolvedValue(null);

    await expect(
      new PublishElectionUseCase(elections, audit).execute({
        electionId: 'election-1',
        requestingUserId: 'admin-1',
      }),
    ).rejects.toBeInstanceOf(ElectionStatusTransitionError);
    expect(audit.log.mock.calls).toHaveLength(0);
  });
});
