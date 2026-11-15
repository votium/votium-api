import type {
  ActiveParticipationCounts,
  ElectoralRollRepository,
} from 'src/modules/elections/domain/repositories/electoral-roll.repository.interface';
import type { ElectorEntity } from '../../domain/entities/elector.entity';
import { ElectorNotFoundError } from '../../domain/errors/elector-not-found.error';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';
import { GetVoterActiveParticipationUseCase } from './get-voter-active-participation.use-case';

const ELECTOR_ID = '11111111-1111-4111-8111-111111111111';

describe('GetVoterActiveParticipationUseCase', () => {
  const findElector = jest.fn<Promise<ElectorEntity | null>, [string]>();
  const countActive = jest.fn<Promise<ActiveParticipationCounts>, [string]>();
  const createMany = jest.fn();
  const deleteByElectionAndElectorId = jest.fn();

  let useCase: GetVoterActiveParticipationUseCase;

  const counts = (activeElections: number, participatedElections: number) =>
    countActive.mockResolvedValue({ activeElections, participatedElections });

  beforeEach(() => {
    jest.resetAllMocks();
    findElector.mockResolvedValue({ id: ELECTOR_ID } as ElectorEntity);
    counts(0, 0);

    useCase = new GetVoterActiveParticipationUseCase(
      { findById: findElector } as unknown as ElectorRepository,
      {
        countActiveParticipationByElector: countActive,
        createMany,
        deleteByElectionAndElectorId,
      } as unknown as ElectoralRollRepository,
    );
  });

  it('VAP-01: throws ElectorNotFoundError and skips the aggregation', async () => {
    findElector.mockResolvedValue(null);

    await expect(useCase.execute({ electorId: ELECTOR_ID })).rejects.toBeInstanceOf(
      ElectorNotFoundError,
    );
    expect(countActive).not.toHaveBeenCalled();
  });

  it('VAP-02: returns zeros when there are no active elections (no division by zero)', async () => {
    await expect(useCase.execute({ electorId: ELECTOR_ID })).resolves.toEqual({
      participatedElections: 0,
      activeElections: 0,
      participation: 0,
    });
  });

  it('VAP-03: returns the counts as given and the percentage', async () => {
    counts(5, 3);

    await expect(useCase.execute({ electorId: ELECTOR_ID })).resolves.toEqual({
      participatedElections: 3,
      activeElections: 5,
      participation: 60,
    });
    expect(countActive).toHaveBeenCalledWith(ELECTOR_ID);
  });

  it.each([
    [3, 1, 33.33],
    [3, 2, 66.67],
    [5, 5, 100],
    [4, 0, 0],
  ])(
    'VAP-04: %i active / %i participated gives %d (2 decimals)',
    async (active, participated, expected) => {
      counts(active, participated);

      const result = await useCase.execute({ electorId: ELECTOR_ID });

      expect(result.participation).toBe(expected);
    },
  );

  it('VAP-05: is read-only (no write methods invoked)', async () => {
    counts(2, 1);

    await useCase.execute({ electorId: ELECTOR_ID });

    expect(createMany).not.toHaveBeenCalled();
    expect(deleteByElectionAndElectorId).not.toHaveBeenCalled();
  });
});
