import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';
import { ElectoralRollCsvFileParserService } from './electoral-roll-csv-file-parser.service';

function toBuffer(content: string): Buffer {
  return Buffer.from(content, 'utf-8');
}

describe('ElectoralRollCsvFileParserService', () => {
  const parser = new ElectoralRollCsvFileParserService();

  describe('valid CSV', () => {
    it('should parse a simple 2-column CSV without header', () => {
      const csv = '12345678,1234\n87654321,5678';
      const rows = parser.parse(toBuffer(csv));

      expect(rows).toEqual([
        { studentCode: '12345678', programCode: '1234' },
        { studentCode: '87654321', programCode: '5678' },
      ]);
    });

    it('should skip a header row and parse data rows', () => {
      const csv = 'studentCode,programCode\n12345678,1234\n87654321,5678';
      const rows = parser.parse(toBuffer(csv));

      expect(rows).toEqual([
        { studentCode: '12345678', programCode: '1234' },
        { studentCode: '87654321', programCode: '5678' },
      ]);
    });

    it('should handle BOM', () => {
      const csv = '\uFEFFstudentCode,programCode\n12345678,1234';
      const rows = parser.parse(toBuffer(csv));

      expect(rows).toEqual([{ studentCode: '12345678', programCode: '1234' }]);
    });

    it('should trim whitespace from cells', () => {
      const csv = ' 12345678 , 1234 ';
      const rows = parser.parse(toBuffer(csv));

      expect(rows).toEqual([{ studentCode: '12345678', programCode: '1234' }]);
    });
  });

  describe('header detection', () => {
    it('should treat non-numeric first cell as header', () => {
      const csv = 'code_estudiante,code_programme\n12345678,1234';
      const rows = parser.parse(toBuffer(csv));

      expect(rows).toEqual([{ studentCode: '12345678', programCode: '1234' }]);
    });

    it('should NOT treat numeric first cell as header', () => {
      const csv = '12345678,1234\n87654321,5678';
      const rows = parser.parse(toBuffer(csv));

      expect(rows).toHaveLength(2);
    });
  });

  describe('column count validation', () => {
    it('should reject a row with 3 columns', () => {
      const csv = '12345678,1234,extra';
      expect(() => parser.parse(toBuffer(csv))).toThrow(BadRequestException);
      expect(() => parser.parse(toBuffer(csv))).toThrow(
        'Each CSV row must contain exactly two columns.',
      );
    });

    it('should reject a row with 1 column', () => {
      const csv = '12345678';
      expect(() => parser.parse(toBuffer(csv))).toThrow(BadRequestException);
    });
  });

  describe('empty cell validation', () => {
    it('should reject a row with empty studentCode', () => {
      const csv = ',1234';
      expect(() => parser.parse(toBuffer(csv))).toThrow(BadRequestException);
      expect(() => parser.parse(toBuffer(csv))).toThrow('CSV contains incomplete rows.');
    });

    it('should reject a row with empty programCode', () => {
      const csv = '12345678,';
      expect(() => parser.parse(toBuffer(csv))).toThrow(BadRequestException);
      expect(() => parser.parse(toBuffer(csv))).toThrow('CSV contains incomplete rows.');
    });
  });

  describe('programCode format validation', () => {
    it('should reject a programCode with fewer than 4 digits', () => {
      const csv = '12345678,123';
      expect(() => parser.parse(toBuffer(csv))).toThrow(BadRequestException);
      expect(() => parser.parse(toBuffer(csv))).toThrow(
        'Program code must contain exactly four digits.',
      );
    });

    it('should reject a programCode with more than 4 digits', () => {
      const csv = '12345678,12345';
      expect(() => parser.parse(toBuffer(csv))).toThrow(BadRequestException);
    });

    it('should reject a programCode with non-digit characters', () => {
      const csv = '12345678,12ab';
      expect(() => parser.parse(toBuffer(csv))).toThrow(BadRequestException);
    });
  });

  describe('edge cases', () => {
    it('should return empty array for an empty CSV', () => {
      const csv = '';
      const rows = parser.parse(toBuffer(csv));
      expect(rows).toEqual([]);
    });

    it('should handle CSV with only a header row', () => {
      const csv = 'studentCode,programCode';
      const rows = parser.parse(toBuffer(csv));
      expect(rows).toEqual([]);
    });

    it('should reject invalid CSV format', () => {
      // 0xFF 0xFE is not valid UTF-8
      const buffer = Buffer.from([0xff, 0xfe, 0xfd]);
      expect(() => parser.parse(buffer)).toThrow(BadRequestException);
    });
  });
});
