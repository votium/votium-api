import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';
import { CsvFileParserService } from './csv-file-parser.service';

const service = new CsvFileParserService();

const VALID_CSV = [
  '202012345,Juan Camilo,Garcia Saenz,2710,juan.garcia@correounivalle.edu.co',
  '202012346,Maria Fernanda,Rodriguez Perez,2710,maria.rodriguez@correounivalle.edu.co',
].join('\n');

const ROW_1 = {
  studentCode: '202012345',
  firstName: 'Juan Camilo',
  lastName: 'Garcia Saenz',
  programCode: '2710',
  email: 'juan.garcia@correounivalle.edu.co',
};

const ROW_2 = {
  studentCode: '202012346',
  firstName: 'Maria Fernanda',
  lastName: 'Rodriguez Perez',
  programCode: '2710',
  email: 'maria.rodriguez@correounivalle.edu.co',
};

function expectBadRequest(buffer: Buffer, message: string) {
  let error: unknown;
  try {
    service.parse(buffer);
  } catch (caught) {
    error = caught;
  }
  expect(error).toBeInstanceOf(BadRequestException);
  expect((error as BadRequestException).message).toBe(message);
}

describe('CsvFileParserService', () => {
  it('parses a valid CSV into typed rows', () => {
    const rows = service.parse(Buffer.from(VALID_CSV, 'utf8'));

    expect(rows).toEqual([ROW_1, ROW_2]);
  });

  it('parses the exact spec example', () => {
    const csv = [
      '202012345,Juan Camilo,Garcia Saenz,2710,juan.garcia@correounivalle.edu.co',
      '202012346,Maria Fernanda,Rodriguez Perez,2710,maria.rodriguez@correounivalle.edu.co',
    ].join('\n');

    expect(service.parse(Buffer.from(csv, 'utf8'))).toEqual([ROW_1, ROW_2]);
  });

  it('skips an optional header row', () => {
    const csv = ['student_code,first_name,last_name,program_code,email', VALID_CSV].join('\n');

    expect(service.parse(Buffer.from(csv, 'utf8'))).toEqual([ROW_1, ROW_2]);
  });

  it('skips a header row with arbitrary column names', () => {
    const csv = ['code,names,surnames,program,email', VALID_CSV].join('\n');

    expect(service.parse(Buffer.from(csv, 'utf8'))).toEqual([ROW_1, ROW_2]);
  });

  it('ignores blank lines', () => {
    const csv = [
      '',
      '202012345,Juan Camilo,Garcia Saenz,2710,juan.garcia@correounivalle.edu.co',
      '',
      '',
    ].join('\n');

    expect(service.parse(Buffer.from(csv, 'utf8'))).toEqual([ROW_1]);
  });

  it('strips a UTF-8 BOM', () => {
    const csv = `\uFEFF${VALID_CSV}`;

    expect(service.parse(Buffer.from(csv, 'utf8'))).toEqual([ROW_1, ROW_2]);
  });

  it('trims whitespace from cells', () => {
    const csv =
      ' 202012345 , Juan Camilo , Garcia Saenz , 2710 , juan.garcia@correounivalle.edu.co ';

    expect(service.parse(Buffer.from(csv, 'utf8'))).toEqual([ROW_1]);
  });

  it('returns an empty array for an empty file', () => {
    expect(service.parse(Buffer.from('', 'utf8'))).toEqual([]);
  });

  it('returns an empty array for a file with only blank lines', () => {
    expect(service.parse(Buffer.from('\n\n\n', 'utf8'))).toEqual([]);
  });

  it('returns an empty array for a file with only a header', () => {
    const csv = 'student_code,first_name,last_name,program_code,email';

    expect(service.parse(Buffer.from(csv, 'utf8'))).toEqual([]);
  });

  it('rejects non-UTF-8 content with Invalid CSV format', () => {
    expectBadRequest(Buffer.from([0xff, 0xfe, 0x31]), 'Invalid CSV format.');
  });

  it('rejects malformed CSV (unclosed quote) with Invalid CSV format', () => {
    const csv = '202012345,"Juan Camilo,Garcia Saenz,2710,juan.garcia@correounivalle.edu.co';

    expectBadRequest(Buffer.from(csv, 'utf8'), 'Invalid CSV format.');
  });

  it('rejects a row with fewer than five columns', () => {
    const csv = '202012345,Juan Camilo,Garcia Saenz,2710';

    expectBadRequest(Buffer.from(csv, 'utf8'), 'Each CSV row must contain exactly five columns.');
  });

  it('rejects a row with more than five columns', () => {
    const csv = `${VALID_CSV}\n202012347,Carlos,Lopez,2711,carlos@correounivalle.edu.co,EXTRA`;

    expectBadRequest(Buffer.from(csv, 'utf8'), 'Each CSV row must contain exactly five columns.');
  });

  it('rejects a program code with three digits', () => {
    const csv = '202012345,Juan Camilo,Garcia Saenz,271,juan.garcia@correounivalle.edu.co';

    expectBadRequest(Buffer.from(csv, 'utf8'), 'Program code must contain exactly four digits.');
  });

  it('rejects a program code with five digits or letters', () => {
    const csv = '202012345,Juan Camilo,Garcia Saenz,2710A,juan.garcia@correounivalle.edu.co';

    expectBadRequest(Buffer.from(csv, 'utf8'), 'Program code must contain exactly four digits.');
  });

  it('rejects a five-column row with an empty email', () => {
    const csv = '202012345,Juan Camilo,Garcia Saenz,2710,';

    expectBadRequest(Buffer.from(csv, 'utf8'), 'CSV contains incomplete rows.');
  });

  it('rejects a five-column row with an empty first name', () => {
    const csv = '202012345,,Garcia Saenz,2710,juan.garcia@correounivalle.edu.co';

    expectBadRequest(Buffer.from(csv, 'utf8'), 'CSV contains incomplete rows.');
  });

  it('rejects a row of only commas as incomplete', () => {
    const csv = [',,,,', VALID_CSV].join('\n');

    expectBadRequest(Buffer.from(csv, 'utf8'), 'CSV contains incomplete rows.');
  });

  it('prefers the column-count error over the program-code error', () => {
    const csv = '202012345,Juan Camilo,Garcia Saenz,271';

    expectBadRequest(Buffer.from(csv, 'utf8'), 'Each CSV row must contain exactly five columns.');
  });

  it('accepts a program code that is valid after trimming', () => {
    const csv = '202012345,Juan Camilo,Garcia Saenz, 2710 ,juan.garcia@correounivalle.edu.co';

    expect(service.parse(Buffer.from(csv, 'utf8'))).toEqual([ROW_1]);
  });
});
