import { ElectionCodeVO } from './election-code.vo';

describe('ElectionCodeVO', () => {
  describe('periodFor', () => {
    it('U-VO-01: formats October 2026 as MMYYYY', () => {
      expect(ElectionCodeVO.periodFor(new Date('2026-10-15T12:00:00.000Z'))).toBe('102026');
    });

    it('U-VO-02: pads January with a leading zero', () => {
      expect(ElectionCodeVO.periodFor(new Date('2027-01-01T00:00:00.000Z'))).toBe('012027');
    });

    it('U-VO-03: uses the UTC month before the boundary', () => {
      expect(ElectionCodeVO.periodFor(new Date('2026-10-31T23:59:59.000Z'))).toBe('102026');
    });

    it('U-VO-04: uses the UTC month after the boundary', () => {
      expect(ElectionCodeVO.periodFor(new Date('2026-11-01T00:00:00.000Z'))).toBe('112026');
    });
  });

  describe('generate', () => {
    it('U-VO-05: builds the first code of a period', () => {
      expect(ElectionCodeVO.generate('102026', 1).value).toBe('ELECTION-102026-0001');
    });

    it('U-VO-06: pads the sequence to four digits', () => {
      expect(ElectionCodeVO.generate('102026', 42).value).toBe('ELECTION-102026-0042');
    });

    it('U-VO-07: accepts the last valid sequence', () => {
      expect(ElectionCodeVO.generate('102026', 9999).value).toBe('ELECTION-102026-9999');
    });

    it('U-VO-08: rejects sequence zero', () => {
      expect(() => ElectionCodeVO.generate('102026', 0)).toThrow();
    });

    it('U-VO-09: rejects sequence 10000', () => {
      expect(() => ElectionCodeVO.generate('102026', 10000)).toThrow();
    });

    it('U-VO-10: rejects a non-integer sequence', () => {
      expect(() => ElectionCodeVO.generate('102026', 1.5)).toThrow();
    });

    it('U-VO-11: rejects month 00', () => {
      expect(() => ElectionCodeVO.generate('002026', 1)).toThrow();
    });

    it('U-VO-12: rejects month 13', () => {
      expect(() => ElectionCodeVO.generate('132026', 1)).toThrow();
    });
  });

  describe('from', () => {
    it('U-VO-13: parses a valid code', () => {
      expect(ElectionCodeVO.from('ELECTION-102026-0001').value).toBe('ELECTION-102026-0001');
    });

    it.each([
      ['U-VO-14', 'ELECTIONX-102026-0001'],
      ['U-VO-15', 'ELECTION-102026-001'],
      ['U-VO-16', 'ELECTION-102026-0000'],
      ['U-VO-17', 'ELECTION-102026-10000'],
      ['U-VO-18', 'ELECTION-132026-0001'],
    ])('%s: rejects invalid code %s', (_id, value) => {
      expect(() => ElectionCodeVO.from(value)).toThrow();
    });
  });
});
