import { ElectoralRegistryDuplicateValidator } from './electoral-registry-duplicate.validator';

describe('ElectoralRegistryDuplicateValidator', () => {
  const validator = new ElectoralRegistryDuplicateValidator();

  describe('no duplicates', () => {
    it('reports no duplicates for zero rows and no existing records', () => {
      expect(validator.validate([], [])).toEqual({
        hasDuplicates: false,
        inFileDuplicates: 0,
        existingDuplicates: 0,
      });
    });

    it('reports no duplicates for a single row with no existing records', () => {
      const rows = [{ studentCode: '202012345', email: 'a@example.com' }];

      expect(validator.validate(rows, [])).toEqual({
        hasDuplicates: false,
        inFileDuplicates: 0,
        existingDuplicates: 0,
      });
    });

    it('reports no duplicates when all rows are distinct', () => {
      const rows = [
        { studentCode: '202012345', email: 'a@example.com' },
        { studentCode: '202012346', email: 'b@example.com' },
        { studentCode: '202012347', email: 'c@example.com' },
      ];

      expect(validator.validate(rows, [])).toEqual({
        hasDuplicates: false,
        inFileDuplicates: 0,
        existingDuplicates: 0,
      });
    });

    it('reports no duplicates when existing records share no values with the rows', () => {
      const rows = [{ studentCode: '202012345', email: 'a@example.com' }];
      const existing = [{ studentCode: '000000000', email: 'other@example.com' }];

      expect(validator.validate(rows, existing)).toEqual({
        hasDuplicates: false,
        inFileDuplicates: 0,
        existingDuplicates: 0,
      });
    });
  });

  describe('in-file duplicates', () => {
    it('detects a repeated student_code within the file', () => {
      const rows = [
        { studentCode: '202012345', email: 'a@example.com' },
        { studentCode: '202012346', email: 'b@example.com' },
        { studentCode: '202012345', email: 'c@example.com' },
      ];

      const report = validator.validate(rows, []);

      expect(report.hasDuplicates).toBe(true);
      expect(report.inFileDuplicates).toBe(1);
    });

    it('detects three occurrences of the same student_code', () => {
      const rows = [
        { studentCode: '202012345', email: 'a@example.com' },
        { studentCode: '202012345', email: 'b@example.com' },
        { studentCode: '202012345', email: 'c@example.com' },
      ];

      const report = validator.validate(rows, []);

      expect(report.inFileDuplicates).toBe(2);
    });

    it('detects a repeated email within the file', () => {
      const rows = [
        { studentCode: '202012345', email: 'a@example.com' },
        { studentCode: '202012346', email: 'b@example.com' },
        { studentCode: '202012347', email: 'a@example.com' },
      ];

      const report = validator.validate(rows, []);

      expect(report.hasDuplicates).toBe(true);
      expect(report.inFileDuplicates).toBe(1);
    });

    it('counts a row once even when both fields duplicate an earlier row', () => {
      const row = { studentCode: '202012345', email: 'same@example.com' };

      const report = validator.validate([row, row], []);

      expect(report.inFileDuplicates).toBe(1);
    });

    it('counts distinct duplicate values independently', () => {
      const rows = [
        { studentCode: '202012345', email: 'a@example.com' },
        { studentCode: '202012345', email: 'b@example.com' },
        { studentCode: '202012346', email: 'a@example.com' },
      ];

      const report = validator.validate(rows, []);

      expect(report.inFileDuplicates).toBe(2);
    });

    it('does not treat a student_code and email as the same field', () => {
      const rows = [
        { studentCode: '202012345', email: 'a@example.com' },
        { studentCode: '202012346', email: '202012345' },
      ];

      const report = validator.validate(rows, []);

      expect(report.hasDuplicates).toBe(false);
      expect(report.inFileDuplicates).toBe(0);
    });
  });

  describe('existing database duplicates', () => {
    it('detects a student_code that exists in the database', () => {
      const rows = [{ studentCode: '202012345', email: 'a@example.com' }];
      const existing = [{ studentCode: '202012345', email: 'other@example.com' }];

      const report = validator.validate(rows, existing);

      expect(report.hasDuplicates).toBe(true);
      expect(report.existingDuplicates).toBe(1);
    });

    it('detects an email that exists in the database', () => {
      const rows = [{ studentCode: '202012345', email: 'a@example.com' }];
      const existing = [{ studentCode: '000000000', email: 'a@example.com' }];

      const report = validator.validate(rows, existing);

      expect(report.hasDuplicates).toBe(true);
      expect(report.existingDuplicates).toBe(1);
    });

    it('counts each matching row once even when both fields exist in the database', () => {
      const rows = [{ studentCode: '202012345', email: 'a@example.com' }];
      const existing = [
        { studentCode: '202012345', email: 'other@example.com' },
        { studentCode: '000000000', email: 'a@example.com' },
      ];

      const report = validator.validate(rows, existing);

      expect(report.existingDuplicates).toBe(1);
    });

    it('counts multiple rows matching existing records', () => {
      const rows = [
        { studentCode: '202012345', email: 'a@example.com' },
        { studentCode: '202012346', email: 'b@example.com' },
        { studentCode: '202012347', email: 'c@example.com' },
      ];
      const existing = [{ studentCode: '202012346', email: 'a@example.com' }];

      const report = validator.validate(rows, existing);

      expect(report.existingDuplicates).toBe(2);
    });

    it('ignores existing records whose values do not appear in the rows', () => {
      const rows = [{ studentCode: '202012345', email: 'a@example.com' }];
      const existing = [{ studentCode: '999999999', email: 'z@example.com' }];

      expect(validator.validate(rows, existing).existingDuplicates).toBe(0);
    });

    it('ignores existing records that match nothing even when existing is large', () => {
      const rows = [{ studentCode: '202012345', email: 'a@example.com' }];
      const existing = Array.from({ length: 50 }, (_, index) => ({
        studentCode: `Z${index}`,
        email: `z${index}@example.com`,
      }));

      expect(validator.validate(rows, existing).existingDuplicates).toBe(0);
    });
  });

  describe('combined scenarios', () => {
    it('reports in-file and existing duplicates together', () => {
      const rows = [
        { studentCode: '202012345', email: 'a@example.com' },
        { studentCode: '202012345', email: 'b@example.com' },
        { studentCode: '202012346', email: 'c@example.com' },
      ];
      const existing = [{ studentCode: '999999999', email: 'c@example.com' }];

      const report = validator.validate(rows, existing);

      expect(report.hasDuplicates).toBe(true);
      expect(report.inFileDuplicates).toBe(1);
      expect(report.existingDuplicates).toBe(1);
    });

    it('counts in-file and existing buckets independently for the same value', () => {
      const rows = [
        { studentCode: '202012345', email: 'a@example.com' },
        { studentCode: '202012345', email: 'b@example.com' },
      ];
      const existing = [{ studentCode: '202012345', email: 'other@example.com' }];

      const report = validator.validate(rows, existing);

      // in-file bucket counts the later occurrence of the repeated code.
      expect(report.inFileDuplicates).toBe(1);
      // existing bucket counts every row whose code exists in the database.
      expect(report.existingDuplicates).toBe(2);
    });
  });
});
