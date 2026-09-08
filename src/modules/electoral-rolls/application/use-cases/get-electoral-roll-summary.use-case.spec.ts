import { ElectionEntity } from 'src/modules/elections/domain/entities/election.entity';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type { ElectoralRollRepository } from '../../domain/repositories/electoral-roll.repository.interface';
import { GetElectoralRollSummaryUseCase } from './get-electoral-roll-summary.use-case';

function buildElection(): ElectionEntity {
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
  });
}

describe('GetElectoralRollSummaryUseCase', () => {
  const elections: jest.Mocked<ElectionRepository> = {
    findAll: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    hasCandidates: jest.fn(),
    hasVotes: jest.fn(),
    delete: jest.fn(),
  };

  const rolls: jest.Mocked<ElectoralRollRepository> = {
    findByElectionAndElectorIds: jest.fn(),
    createMany: jest.fn(),
    countByElection: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GS1: returns the election name and the registered-voter count for an existing election', async () => {
    elections.findById.mockResolvedValue(buildElection());
    rolls.countByElection.mockResolvedValue(5);

    const result = await new GetElectoralRollSummaryUseCase(elections, rolls).execute('election-1');

    expect(result).toEqual({
      electionName: 'Student Council Election 2026',
      registeredVoters: 5,
    });
  });

  it('GS1b: the election name comes from the persisted election entity', async () => {
    const election = buildElection();
    elections.findById.mockResolvedValue(election);
    rolls.countByElection.mockResolvedValue(0);

    const result = await new GetElectoralRollSummaryUseCase(elections, rolls).execute('election-1');

    expect(result.electionName).toBe(election.name);
  });

  it('GS2: throws ElectionNotFoundError when the election does not exist', async () => {
    elections.findById.mockResolvedValue(null);

    await expect(
      new GetElectoralRollSummaryUseCase(elections, rolls).execute('election-1'),
    ).rejects.toBeInstanceOf(ElectionNotFoundError);
    await expect(
      new GetElectoralRollSummaryUseCase(elections, rolls).execute('election-1'),
    ).rejects.toMatchObject({ code: 'ELECTION_NOT_FOUND' });
  });

  it('GS2b: never counts the electoral roll of a nonexistent election', async () => {
    elections.findById.mockResolvedValue(null);

    await expect(
      new GetElectoralRollSummaryUseCase(elections, rolls).execute('election-1'),
    ).rejects.toBeInstanceOf(ElectionNotFoundError);

    expect(rolls.countByElection.mock.calls).toHaveLength(0);
  });

  it('GS3: returns registeredVoters 0 for an existing election with no rolls', async () => {
    elections.findById.mockResolvedValue(buildElection());
    rolls.countByElection.mockResolvedValue(0);

    const result = await new GetElectoralRollSummaryUseCase(elections, rolls).execute('election-1');

    expect(result).toEqual({
      electionName: 'Student Council Election 2026',
      registeredVoters: 0,
    });
  });

  it('GS4a: propagates an unexpected findById failure unchanged', async () => {
    elections.findById.mockRejectedValue(new Error('database exploded'));

    await expect(
      new GetElectoralRollSummaryUseCase(elections, rolls).execute('election-1'),
    ).rejects.toThrow('database exploded');
    expect(rolls.countByElection.mock.calls).toHaveLength(0);
  });

  it('GS4b: propagates an unexpected countByElection failure unchanged', async () => {
    elections.findById.mockResolvedValue(buildElection());
    rolls.countByElection.mockRejectedValue(new Error('database exploded'));

    await expect(
      new GetElectoralRollSummaryUseCase(elections, rolls).execute('election-1'),
    ).rejects.toThrow('database exploded');
  });

  it('GS5: delegates both queries with the exact election id', async () => {
    elections.findById.mockResolvedValue(buildElection());
    rolls.countByElection.mockResolvedValue(3);

    await new GetElectoralRollSummaryUseCase(elections, rolls).execute('election-1');

    expect(elections.findById.mock.calls).toEqual([['election-1']]);
    expect(rolls.countByElection.mock.calls).toEqual([['election-1']]);
  });
});
