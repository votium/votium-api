import type { ElectionEntity } from 'src/modules/elections/domain/entities/election.entity';
import type {
  ElectionRepository,
  VoterElectionRow,
} from 'src/modules/elections/domain/repositories/election.repository.interface';
import type { ElectoralRollRepository } from 'src/modules/elections/domain/repositories/electoral-roll.repository.interface';
import type { ElectorEntity } from '../../domain/entities/elector.entity';
import { ElectorNotFoundError } from '../../domain/errors/elector-not-found.error';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';
import { GetVoterUpcomingElectionsUseCase } from './get-voter-upcoming-elections.use-case';

const ELECTOR_ID = '11111111-1111-4111-8111-111111111111';

function row(id: string, hasVoted = false): VoterElectionRow {
  return { election: { id } as ElectionEntity, hasVoted, participationDate: null };
}

describe('GetVoterUpcomingElectionsUseCase', () => {
  const findElector = jest.fn<Promise<ElectorEntity | null>, [string]>();
  const findUpcoming = jest.fn<Promise<VoterElectionRow[]>, [unknown]>();
  const countByElectionIds = jest.fn<
    Promise<Array<{ electionId: string; total: number }>>,
    [string[]]
  >();
  const countVotedByElectionIds = jest.fn<
    Promise<Array<{ electionId: string; total: number }>>,
    [string[]]
  >();
  const createMany = jest.fn();
  const deleteByElectionAndElectorId = jest.fn();

  let useCase: GetVoterUpcomingElectionsUseCase;

  beforeEach(() => {
    jest.resetAllMocks();
    findElector.mockResolvedValue({ id: ELECTOR_ID } as ElectorEntity);
    findUpcoming.mockResolvedValue([]);
    countByElectionIds.mockResolvedValue([]);
    countVotedByElectionIds.mockResolvedValue([]);

    useCase = new GetVoterUpcomingElectionsUseCase(
      { findById: findElector } as unknown as ElectorRepository,
      { findUpcomingAndActiveByElector: findUpcoming } as unknown as ElectionRepository,
      {
        countByElectionIds,
        countVotedByElectionIds,
        createMany,
        deleteByElectionAndElectorId,
      } as unknown as ElectoralRollRepository,
    );
  });

  it('UPV-01: throws ElectorNotFoundError and skips the elections lookup', async () => {
    findElector.mockResolvedValue(null);

    await expect(useCase.execute({ electorId: ELECTOR_ID })).rejects.toBeInstanceOf(
      ElectorNotFoundError,
    );
    expect(findUpcoming).not.toHaveBeenCalled();
  });

  it('UPV-02: returns [] without querying counts when there are no elections', async () => {
    await expect(useCase.execute({ electorId: ELECTOR_ID })).resolves.toEqual([]);
    expect(countByElectionIds).not.toHaveBeenCalled();
    expect(countVotedByElectionIds).not.toHaveBeenCalled();
  });

  it('UPV-03: forwards electorId and now to the repository', async () => {
    const now = new Date('2026-11-10T12:00:00.000Z');

    await useCase.execute({ electorId: ELECTOR_ID, now });

    expect(findUpcoming).toHaveBeenCalledWith({ electorId: ELECTOR_ID, now });
  });

  it('UPV-04: maps counts by election id and defaults missing ones to 0', async () => {
    findUpcoming.mockResolvedValue([row('e1'), row('e2')]);
    countByElectionIds.mockResolvedValue([{ electionId: 'e1', total: 4 }]);
    countVotedByElectionIds.mockResolvedValue([{ electionId: 'e1', total: 1 }]);

    const result = await useCase.execute({ electorId: ELECTOR_ID });

    expect(countByElectionIds).toHaveBeenCalledWith(['e1', 'e2']);
    expect(countVotedByElectionIds).toHaveBeenCalledWith(['e1', 'e2']);
    expect(result.map(({ election, ...rest }) => ({ id: election.id, ...rest }))).toEqual([
      {
        id: 'e1',
        participantsCount: 1,
        registeredVotersCount: 4,
        participationPercentage: 25,
        hasVoted: false,
      },
      {
        id: 'e2',
        participantsCount: 0,
        registeredVotersCount: 0,
        participationPercentage: 0,
        hasVoted: false,
      },
    ]);
  });

  it.each([
    [3, 3, 100],
    [1, 3, 33.33],
    [2, 3, 66.67],
    [0, 5, 0],
  ])(
    'UPV-05: %i of %i voters gives %d%% (2 decimals)',
    async (participants, registered, expected) => {
      findUpcoming.mockResolvedValue([row('e1')]);
      countByElectionIds.mockResolvedValue([{ electionId: 'e1', total: registered }]);
      countVotedByElectionIds.mockResolvedValue([{ electionId: 'e1', total: participants }]);

      const [item] = await useCase.execute({ electorId: ELECTOR_ID });

      expect(item.participationPercentage).toBe(expected);
    },
  );

  it('UPV-06: takes hasVoted from the elector own roll row, not from the counts', async () => {
    findUpcoming.mockResolvedValue([row('e1', true), row('e2', false)]);
    countByElectionIds.mockResolvedValue([
      { electionId: 'e1', total: 2 },
      { electionId: 'e2', total: 2 },
    ]);
    countVotedByElectionIds.mockResolvedValue([{ electionId: 'e2', total: 2 }]);

    const result = await useCase.execute({ electorId: ELECTOR_ID });

    expect(result.map((item) => item.hasVoted)).toEqual([true, false]);
  });

  it('UPV-07: is read-only (no write methods invoked)', async () => {
    findUpcoming.mockResolvedValue([row('e1')]);

    await useCase.execute({ electorId: ELECTOR_ID });

    expect(createMany).not.toHaveBeenCalled();
    expect(deleteByElectionAndElectorId).not.toHaveBeenCalled();
  });
});
