import { ElectionEntity } from '../../domain/entities/election.entity';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import { ElectionNotDeletableError } from '../../domain/errors/election-not-deletable.error';
import { ElectionHasCandidatesError } from '../../domain/errors/election-has-candidates.error';
import { ElectionHasVotesError } from '../../domain/errors/election-has-votes.error';
import { DeleteElectionUseCase } from './delete-election.use-case';

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

describe('DeleteElectionUseCase', () => {
  const elections: jest.Mocked<ElectionRepository> = {
    findAll: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    hasCandidates: jest.fn(),
    hasVotes: jest.fn(),
    delete: jest.fn(),
  };
  const audit: jest.Mocked<Pick<AuditLogPort, 'log'>> = {
    log: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    elections.findById.mockResolvedValue(buildElection());
    elections.hasCandidates.mockResolvedValue(false);
    elections.hasVotes.mockResolvedValue(false);
    elections.delete.mockResolvedValue(undefined);
  });

  it('UC-1: deletes an eligible CREATED election and logs the audit entry', async () => {
    await new DeleteElectionUseCase(elections, audit).execute('election-1', 'admin-1');

    expect(elections.delete.mock.calls).toHaveLength(1);
    expect(elections.delete.mock.calls[0]).toEqual(['election-1']);
    expect(audit.log.mock.calls).toHaveLength(1);
    expect(audit.log.mock.calls[0]).toEqual([
      'ELECTION_DELETED',
      'admin-1',
      { electionId: 'election-1' },
    ]);
  });

  it('UC-2: throws ElectionNotFoundError when the election does not exist', async () => {
    elections.findById.mockResolvedValue(null);

    await expect(
      new DeleteElectionUseCase(elections, audit).execute('missing', 'admin-1'),
    ).rejects.toBeInstanceOf(ElectionNotFoundError);
    expect(elections.delete.mock.calls).toHaveLength(0);
  });

  it('UC-3: throws ElectionNotDeletableError for non-CREATED status and never deletes', async () => {
    for (const status of ['PENDING', 'PUBLISHED', 'CLOSED', 'ACTIVE'] as const) {
      elections.findById.mockResolvedValue(buildElection({ currentStatus: status }));
      await expect(
        new DeleteElectionUseCase(elections, audit).execute('election-1', 'admin-1'),
      ).rejects.toBeInstanceOf(ElectionNotDeletableError);
    }
    expect(elections.delete.mock.calls).toHaveLength(0);
  });

  it('UC-4: throws ElectionHasCandidatesError when one candidate exists and never deletes', async () => {
    elections.hasCandidates.mockResolvedValue(true);

    await expect(
      new DeleteElectionUseCase(elections, audit).execute('election-1', 'admin-1'),
    ).rejects.toBeInstanceOf(ElectionHasCandidatesError);
    expect(elections.delete.mock.calls).toHaveLength(0);
  });

  it('UC-5: throws ElectionHasCandidatesError when multiple candidates exist (single boolean gate)', async () => {
    elections.hasCandidates.mockResolvedValue(true);

    await expect(
      new DeleteElectionUseCase(elections, audit).execute('election-1', 'admin-1'),
    ).rejects.toBeInstanceOf(ElectionHasCandidatesError);
    expect(elections.delete.mock.calls).toHaveLength(0);
  });

  it('UC-6: throws ElectionHasVotesError when one vote exists and never deletes', async () => {
    elections.hasVotes.mockResolvedValue(true);

    await expect(
      new DeleteElectionUseCase(elections, audit).execute('election-1', 'admin-1'),
    ).rejects.toBeInstanceOf(ElectionHasVotesError);
    expect(elections.delete.mock.calls).toHaveLength(0);
  });

  it('UC-7: throws ElectionHasVotesError when multiple votes exist (single boolean gate)', async () => {
    elections.hasVotes.mockResolvedValue(true);

    await expect(
      new DeleteElectionUseCase(elections, audit).execute('election-1', 'admin-1'),
    ).rejects.toBeInstanceOf(ElectionHasVotesError);
    expect(elections.delete.mock.calls).toHaveLength(0);
  });

  it('UC-8: checks candidates before votes (does not reach hasVotes when candidates exist)', async () => {
    elections.hasCandidates.mockResolvedValue(true);
    elections.hasVotes.mockResolvedValue(true);

    await expect(
      new DeleteElectionUseCase(elections, audit).execute('election-1', 'admin-1'),
    ).rejects.toBeInstanceOf(ElectionHasCandidatesError);
    expect(elections.hasVotes.mock.calls).toHaveLength(0);
  });

  it('UC-9: never deletes when any business rule fails (no partial deletion)', async () => {
    elections.findById.mockResolvedValue(null);
    await expect(
      new DeleteElectionUseCase(elections, audit).execute('election-1', 'admin-1'),
    ).rejects.toBeInstanceOf(ElectionNotFoundError);

    elections.findById.mockResolvedValue(buildElection({ currentStatus: 'ACTIVE' }));
    await expect(
      new DeleteElectionUseCase(elections, audit).execute('election-1', 'admin-1'),
    ).rejects.toBeInstanceOf(ElectionNotDeletableError);

    elections.findById.mockResolvedValue(buildElection());
    elections.hasCandidates.mockResolvedValue(true);
    await expect(
      new DeleteElectionUseCase(elections, audit).execute('election-1', 'admin-1'),
    ).rejects.toBeInstanceOf(ElectionHasCandidatesError);

    elections.hasCandidates.mockResolvedValue(false);
    elections.hasVotes.mockResolvedValue(true);
    await expect(
      new DeleteElectionUseCase(elections, audit).execute('election-1', 'admin-1'),
    ).rejects.toBeInstanceOf(ElectionHasVotesError);

    expect(elections.delete.mock.calls).toHaveLength(0);
  });

  it('UC-10: skips the audit log when requestingUserId is empty', async () => {
    await new DeleteElectionUseCase(elections, audit).execute('election-1', '');

    expect(elections.delete.mock.calls).toHaveLength(1);
    expect(audit.log.mock.calls).toHaveLength(0);
  });

  it('UC-11: propagates repository failures unchanged and does not log audit', async () => {
    elections.delete.mockRejectedValue(new Error('database exploded'));

    await expect(
      new DeleteElectionUseCase(elections, audit).execute('election-1', 'admin-1'),
    ).rejects.toThrow('database exploded');
    expect(audit.log.mock.calls).toHaveLength(0);
  });
});
