import { ElectorNotFoundError } from '../../domain/errors/elector-not-found.error';
import { GetScheduledElectionsCountUseCase } from './get-scheduled-elections-count.use-case';

const ELECTOR_ID = '6f1c2a9e-7b4d-4c1a-9f2e-1a2b3c4d5e6f';

function build(elector: object | null, count = 0) {
  const electors = { findById: jest.fn().mockResolvedValue(elector) };
  const elections = { countEligibleByElector: jest.fn().mockResolvedValue(count) };
  const useCase = new GetScheduledElectionsCountUseCase(electors, elections);
  return { useCase, electors, elections };
}

describe('GetScheduledElectionsCountUseCase', () => {
  it('SC-U-01: throws ElectorNotFoundError and does not count when the elector does not exist', async () => {
    const { useCase, electors, elections } = build(null);

    await expect(useCase.execute({ electorId: ELECTOR_ID })).rejects.toBeInstanceOf(
      ElectorNotFoundError,
    );
    expect(electors.findById).toHaveBeenCalledWith(ELECTOR_ID);
    expect(elections.countEligibleByElector).not.toHaveBeenCalled();
  });

  it('SC-U-02: returns { count: 0 } when the elector has no CREATED elections', async () => {
    const { useCase } = build({ id: ELECTOR_ID }, 0);

    await expect(useCase.execute({ electorId: ELECTOR_ID })).resolves.toEqual({ count: 0 });
  });

  it.each([1, 5])('SC-U-03: returns { count: %i } from the repository', async (count) => {
    const { useCase } = build({ id: ELECTOR_ID }, count);

    await expect(useCase.execute({ electorId: ELECTOR_ID })).resolves.toEqual({ count });
  });

  it('SC-U-04: counts exactly with { electorId, status: CREATED }', async () => {
    const { useCase, elections } = build({ id: ELECTOR_ID }, 2);

    await useCase.execute({ electorId: ELECTOR_ID });

    expect(elections.countEligibleByElector).toHaveBeenCalledTimes(1);
    expect(elections.countEligibleByElector).toHaveBeenCalledWith({
      electorId: ELECTOR_ID,
      status: 'CREATED',
    });
  });

  it('SC-U-05: returns only the repository count (no extra fields, no recalculation)', async () => {
    const { useCase } = build({ id: ELECTOR_ID }, 3);

    const result = await useCase.execute({ electorId: ELECTOR_ID });

    expect(Object.keys(result)).toEqual(['count']);
    expect(result.count).toBe(3);
  });

  it('SC-U-06: propagates repository failures', async () => {
    const { useCase, elections } = build({ id: ELECTOR_ID });
    elections.countEligibleByElector.mockRejectedValue(new Error('db down'));

    await expect(useCase.execute({ electorId: ELECTOR_ID })).rejects.toThrow('db down');
  });

  it('SC-U-07: only reads (findById + countEligibleByElector); no other repository calls', async () => {
    const electors = { findById: jest.fn().mockResolvedValue({ id: ELECTOR_ID }), save: jest.fn() };
    const elections = {
      countEligibleByElector: jest.fn().mockResolvedValue(1),
      findEligibleByElector: jest.fn(),
      updateStatus: jest.fn(),
    };
    const useCase = new GetScheduledElectionsCountUseCase(electors, elections);

    await useCase.execute({ electorId: ELECTOR_ID });

    expect(electors.save).not.toHaveBeenCalled();
    expect(elections.findEligibleByElector).not.toHaveBeenCalled();
    expect(elections.updateStatus).not.toHaveBeenCalled();
  });
});
