import { ElectionEntity } from 'src/modules/elections/domain/entities/election.entity';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type { ElectorRepository } from 'src/modules/electors/domain/repositories/elector.repository.interface';
import { ListElectoralRollElectorsUseCase } from './list-electoral-roll-electors.use-case';

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

describe('ListElectoralRollElectorsUseCase', () => {
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
    findExpiredActive: jest.fn(),
    delete: jest.fn(),
  };

  const electors: jest.Mocked<ElectorRepository> = {
    create: jest.fn(),
    findByStudentCodeOrEmail: jest.fn(),
    findById: jest.fn(),
    softDelete: jest.fn(),
    updateStatus: jest.fn(),
    update: jest.fn(),
    findByEmail: jest.fn(),
    search: jest.fn(),
    findByStudentCodeAndProgramCode: jest.fn(),
    findByElection: jest.fn(),
    findElectionParticipation: jest.fn(),
  };

  beforeEach(() => jest.clearAllMocks());

  function makeUseCase(): ListElectoralRollElectorsUseCase {
    return new ListElectoralRollElectorsUseCase(elections, electors);
  }

  const baseInput = {
    electionId: 'election-1',
    page: 1,
    limit: 10,
  };

  it('LU-01: delegates a filterless query scoped to the election', async () => {
    elections.findById.mockResolvedValue(buildElection());
    electors.findByElection.mockResolvedValue({ electors: [], total: 0 });

    await makeUseCase().execute(baseInput);

    expect(electors.findByElection.mock.calls).toEqual([
      [
        {
          electionId: 'election-1',
          page: 1,
          limit: 10,
          programCode: undefined,
          studentCode: undefined,
          name: undefined,
          status: undefined,
          identification: undefined,
        },
      ],
    ]);
  });

  it('LU-02: forwards every filter verbatim', async () => {
    elections.findById.mockResolvedValue(buildElection());
    electors.findByElection.mockResolvedValue({ electors: [], total: 0 });

    await makeUseCase().execute({
      ...baseInput,
      programCode: '2710',
      studentCode: '202012345',
      name: 'Jane',
      status: 'ACTIVE',
      identification: '123456789',
    });

    expect(electors.findByElection.mock.calls).toEqual([
      [
        {
          electionId: 'election-1',
          page: 1,
          limit: 10,
          programCode: '2710',
          studentCode: '202012345',
          name: 'Jane',
          status: 'ACTIVE',
          identification: '123456789',
        },
      ],
    ]);
  });

  it('LU-03: returns the repository result unreshaped', async () => {
    elections.findById.mockResolvedValue(buildElection());
    electors.findByElection.mockResolvedValue({ electors: [], total: 7 });

    await expect(makeUseCase().execute(baseInput)).resolves.toEqual({ electors: [], total: 7 });
  });

  it('LU-04: rejects a nonexistent election without querying electors', async () => {
    elections.findById.mockResolvedValue(null);

    await expect(makeUseCase().execute(baseInput)).rejects.toBeInstanceOf(ElectionNotFoundError);
    await expect(makeUseCase().execute(baseInput)).rejects.toMatchObject({
      code: 'ELECTION_NOT_FOUND',
    });
    expect(electors.findByElection.mock.calls).toHaveLength(0);
  });

  it('LU-05: returns an empty page for an election with no members', async () => {
    elections.findById.mockResolvedValue(buildElection());
    electors.findByElection.mockResolvedValue({ electors: [], total: 0 });

    await expect(makeUseCase().execute(baseInput)).resolves.toEqual({ electors: [], total: 0 });
  });

  it('LU-06: propagates repository failures unchanged', async () => {
    elections.findById.mockResolvedValue(buildElection());
    electors.findByElection.mockRejectedValue(new Error('database exploded'));

    await expect(makeUseCase().execute(baseInput)).rejects.toThrow('database exploded');
  });

  it('LU-07: only reads — never mutates — via the injected repositories', async () => {
    elections.findById.mockResolvedValue(buildElection());
    electors.findByElection.mockResolvedValue({ electors: [], total: 0 });

    await makeUseCase().execute(baseInput);

    expect(elections.findById.mock.calls).toEqual([['election-1']]);
    expect(electors.create.mock.calls).toHaveLength(0);
    expect(electors.update.mock.calls).toHaveLength(0);
    expect(electors.updateStatus.mock.calls).toHaveLength(0);
    expect(electors.softDelete.mock.calls).toHaveLength(0);
  });
});
