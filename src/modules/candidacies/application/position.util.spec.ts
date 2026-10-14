import { lowestAvailablePosition } from './position.util';

describe('lowestAvailablePosition', () => {
  it('PU-01: returns 1 for an empty election', () => {
    expect(lowestAvailablePosition([])).toBe(1);
  });

  it('PU-02: appends after the maximum when there are no gaps', () => {
    expect(lowestAvailablePosition([1, 2, 3])).toBe(4);
  });

  it('PU-03: reuses the gap left by a deleted candidacy (1,3 -> 2)', () => {
    expect(lowestAvailablePosition([1, 3])).toBe(2);
  });

  it('PU-04: returns 1 when the first position is free', () => {
    expect(lowestAvailablePosition([2, 3])).toBe(1);
  });

  it('PU-05: reuses an intermediate gap with a higher maximum', () => {
    expect(lowestAvailablePosition([1, 2, 4])).toBe(3);
  });

  it('PU-06: does not depend on the input order', () => {
    expect(lowestAvailablePosition([3, 1])).toBe(2);
  });

  it('PU-07: tolerates duplicated positions', () => {
    expect(lowestAvailablePosition([1, 1, 2])).toBe(3);
  });
});
