/* eslint-disable @typescript-eslint/unbound-method */
import type { CandidacyRepository } from 'src/modules/candidacies/domain/repositories/candidacy.repository.interface';
import { ElectionEntity } from 'src/modules/elections/domain/entities/election.entity';
import type {
  ElectionRepository,
  VoterElectionListResult,
} from 'src/modules/elections/domain/repositories/election.repository.interface';
import type { ElectoralRollRepository } from 'src/modules/elections/domain/repositories/electoral-roll.repository.interface';
import { ElectorNotFoundError } from '../../domain/errors/elector-not-found.error';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';
import { GetElectorElectionsUseCase } from './get-elector-elections.use-case';

const date = (y: number, m: number, d: number): Date => new Date(Date.UTC(y, m - 1, d));

function buildElection(id: string): ElectionEntity {
  return ElectionEntity.restore({
    id,
    electionCode: `ELECTION-102026-${id}`,
    name: `Election ${id}`,
    description: 'Election description.',
    startDate: date(2026, 10, 1),
    startTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
    endDate: date(2026, 10, 1),
    endTime: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
    currentStatus: 'ACTIVE',
    blankVoteEnabled: false,
    createdAt: new Date('2026-08-19T15:00:00.000Z'),
  });
}

describe('GetElectorElectionsUseCase', () => {
  let elections: jest.Mocked<ElectionRepository>;
  let electoralRolls: jest.Mocked<ElectoralRollRepository>;
  let candidacies: jest.Mocked<CandidacyRepository>;
  let electors: jest.Mocked<Pick<ElectorRepository, 'findById'>>;
  let useCase: GetElectorElectionsUseCase;

  const eligible = (overrides: Partial<VoterElectionListResult> = {}): VoterElectionListResult => ({
    rows: [
      {
        election: buildElection('a'),
        hasVoted: true,
        participationDate: new Date('2026-09-15T10:00:00.000Z'),
      },
    ],
    total: 1,
    ...overrides,
  });

  beforeEach(() => {
    elections = {
      findEligibleByElector: jest.fn(),
      findStatusHistoryByElectionIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ElectionRepository>;
    electoralRolls = {
      countByElectionIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ElectoralRollRepository>;
    candidacies = {
      findByElectionIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<CandidacyRepository>;
    electors = { findById: jest.fn() };
    electors.findById.mockResolvedValue({ id: 'elector-1' });
    useCase = new GetElectorElectionsUseCase(elections, electoralRolls, candidacies, electors);
  });

  it('resolves the elector and scopes eligibility to electorId', async () => {
    elections.findEligibleByElector.mockResolvedValue(eligible());

    await useCase.execute({ electorId: 'elector-1', page: 1, limit: 10 });

    expect(electors.findById).toHaveBeenCalledWith('elector-1');
    expect(elections.findEligibleByElector).toHaveBeenCalledWith(
      expect.objectContaining({ electorId: 'elector-1' }),
    );
  });

  it('throws ElectorNotFoundError without querying elections when identity is unresolved', async () => {
    electors.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({ electorId: 'missing', page: 1, limit: 10 }),
    ).rejects.toBeInstanceOf(ElectorNotFoundError);
    expect(elections.findEligibleByElector).not.toHaveBeenCalled();
  });

  it('forwards filters and parses date bounds', async () => {
    elections.findEligibleByElector.mockResolvedValue({ rows: [], total: 0 });

    await useCase.execute({
      electorId: 'elector-1',
      page: 2,
      limit: 25,
      electionCode: '102026',
      status: 'ACTIVE',
      startDateFrom: '2026-08-29',
      startDateTo: '2026-12-31',
    });

    expect(elections.findEligibleByElector).toHaveBeenCalledWith({
      electorId: 'elector-1',
      page: 2,
      limit: 25,
      electionCode: '102026',
      status: 'ACTIVE',
      startDateFrom: date(2026, 8, 29),
      startDateTo: date(2026, 12, 31),
    });
  });

  it('normalizes non-positive/NaN pagination values to defaults', async () => {
    elections.findEligibleByElector.mockResolvedValue({ rows: [], total: 0 });

    await useCase.execute({ electorId: 'elector-1', page: 0, limit: Number.NaN });

    expect(elections.findEligibleByElector).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 10 }),
    );
  });

  it('rejects an inverted date range without querying elections', async () => {
    await expect(
      useCase.execute({
        electorId: 'elector-1',
        page: 1,
        limit: 10,
        startDateFrom: '2026-12-31',
        startDateTo: '2026-01-01',
      }),
    ).rejects.toMatchObject({ code: 'ELECTION_INVALID_DATE_RANGE' });
    expect(elections.findEligibleByElector).not.toHaveBeenCalled();
  });

  it('rejects an impossible date with ELECTION_INVALID_DATE', async () => {
    await expect(
      useCase.execute({
        electorId: 'elector-1',
        page: 1,
        limit: 10,
        startDateFrom: '2026-02-30',
      }),
    ).rejects.toMatchObject({ code: 'ELECTION_INVALID_DATE' });
    expect(elections.findEligibleByElector).not.toHaveBeenCalled();
  });

  it('returns an empty result without batch queries', async () => {
    elections.findEligibleByElector.mockResolvedValue({ rows: [], total: 0 });

    const result = await useCase.execute({ electorId: 'elector-1', page: 1, limit: 10 });

    expect(result).toEqual({ items: [], total: 0 });
    expect(elections.findStatusHistoryByElectionIds).not.toHaveBeenCalled();
    expect(candidacies.findByElectionIds).not.toHaveBeenCalled();
    expect(electoralRolls.countByElectionIds).not.toHaveBeenCalled();
  });

  it('composes each item with batched history, candidacies, count and participation', async () => {
    elections.findEligibleByElector.mockResolvedValue({
      rows: [
        {
          election: buildElection('a'),
          hasVoted: true,
          participationDate: new Date('2026-09-15T10:00:00.000Z'),
        },
        { election: buildElection('b'), hasVoted: false, participationDate: null },
      ],
      total: 2,
    });
    elections.findStatusHistoryByElectionIds.mockResolvedValue([
      { electionId: 'a', status: 'PENDING', timestamp: new Date('2026-08-20T10:00:00.000Z') },
      { electionId: 'a', status: 'ACTIVE', timestamp: new Date('2026-08-21T10:00:00.000Z') },
    ]);
    candidacies.findByElectionIds.mockResolvedValue([
      {
        id: 'c-a',
        electionId: 'a',
        candidateId: 'candidate-a',
        candidateFirstName: 'Juan',
        candidateLastName: 'Garcia',
        positionNumber: 1,
        imageUrl: null,
        createdAt: new Date('2026-08-19T15:00:00.000Z'),
      },
    ]);
    electoralRolls.countByElectionIds.mockResolvedValue([
      { electionId: 'a', total: 42 },
      { electionId: 'b', total: 7 },
    ]);

    const result = await useCase.execute({ electorId: 'elector-1', page: 1, limit: 10 });

    expect(elections.findStatusHistoryByElectionIds).toHaveBeenCalledWith(['a', 'b']);
    expect(candidacies.findByElectionIds).toHaveBeenCalledWith(['a', 'b']);
    expect(electoralRolls.countByElectionIds).toHaveBeenCalledWith(['a', 'b']);
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      registeredVoters: 42,
      hasVoted: true,
      participationDate: new Date('2026-09-15T10:00:00.000Z'),
    });
    expect(result.items[0].statusHistory).toHaveLength(2);
    expect(result.items[0].candidacies).toHaveLength(1);
    expect(result.items[1]).toMatchObject({
      registeredVoters: 7,
      hasVoted: false,
      participationDate: null,
      statusHistory: [],
      candidacies: [],
    });
  });

  it('preserves repository row order and total', async () => {
    elections.findEligibleByElector.mockResolvedValue({
      rows: [
        { election: buildElection('b'), hasVoted: false, participationDate: null },
        { election: buildElection('a'), hasVoted: false, participationDate: null },
      ],
      total: 9,
    });

    const result = await useCase.execute({ electorId: 'elector-1', page: 1, limit: 10 });

    expect(result.items.map((item) => item.election.id)).toEqual(['b', 'a']);
    expect(result.total).toBe(9);
  });

  it('propagates repository failures', async () => {
    elections.findEligibleByElector.mockRejectedValue(new Error('database exploded'));

    await expect(useCase.execute({ electorId: 'elector-1', page: 1, limit: 10 })).rejects.toThrow(
      'database exploded',
    );
  });
});
