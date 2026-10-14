import { parse } from 'csv-parse/sync';
import { CsvFileParserService } from '../../infrastructure/services/csv-file-parser.service';
import { GetElectoralRegistryTemplateUseCase } from './get-electoral-registry-template.use-case';

describe('GetElectoralRegistryTemplateUseCase', () => {
  const useCase = new GetElectoralRegistryTemplateUseCase();

  const expectedHeaders = ['studentCode', 'firstName', 'lastName', 'programCode', 'email'];

  function parseRows(csv: string): string[][] {
    return parse(csv, { relax_column_count: false }) as string[][];
  }

  it('TPL-01: returns exactly two rows (header + description)', () => {
    const rows = parseRows(useCase.execute());

    expect(rows).toHaveLength(2);
  });

  it('TPL-02: row 1 contains the official machine-readable headers', () => {
    const [headers] = parseRows(useCase.execute());

    expect(headers).toEqual(expectedHeaders);
  });

  it('TPL-03: row 2 has the same number of columns as row 1', () => {
    const [headers, descriptions] = parseRows(useCase.execute());

    expect(descriptions).toHaveLength(headers.length);
    expect(descriptions).toHaveLength(5);
  });

  it('TPL-04: programCode description documents the four-digit rule', () => {
    const [, descriptions] = parseRows(useCase.execute());

    expect(descriptions[3]).toMatch(/cuatro/);
    expect(descriptions[3]).toMatch(/dígitos/);
  });

  it('TPL-05: studentCode and email descriptions document uniqueness', () => {
    const [, descriptions] = parseRows(useCase.execute());

    expect(descriptions[0]).toMatch(/único/i);
    expect(descriptions[4]).toMatch(/único/i);
  });

  it('TPL-06: descriptions are non-empty Spanish text', () => {
    const [, descriptions] = parseRows(useCase.execute());

    for (const description of descriptions) {
      expect(description.trim().length).toBeGreaterThan(0);
      expect(description).toMatch(/obligatorio/i);
    }
  });

  it('TPL-07: headers are not translated into Spanish', () => {
    const [headers] = parseRows(useCase.execute());

    expect(headers.join(',')).toBe('studentCode,firstName,lastName,programCode,email');
    expect(headers.join(' ').toLowerCase()).not.toMatch(/nombre|apellido|código|correo/);
  });

  it('TPL-08: output is deterministic across calls', () => {
    expect(useCase.execute()).toBe(useCase.execute());
  });

  it('TPL-09: output is valid UTF-8 and preserves accented characters', () => {
    const csv = useCase.execute();

    expect(Buffer.from(csv, 'utf8').toString('utf8')).toBe(csv);
    expect(csv).toContain('dígitos');
    expect(csv).toContain('único');
  });

  it('TPL-10: descriptions containing commas are quoted and do not corrupt the structure', () => {
    const [headers, descriptions] = parseRows(useCase.execute());

    expect(descriptions).toHaveLength(headers.length);

    // studentCode and email descriptions contain a comma; the serialized row must quote them.
    const rawDescriptionRow = useCase.execute().trim().split('\n')[1];
    expect(rawDescriptionRow).toMatch(/^"/);
    expect(descriptions[0]).toContain(',');
    expect(descriptions[4]).toContain(',');
  });

  it('TPL-12: the header row is recognized as a header by the real importer', () => {
    const [headerRow] = useCase.execute().trimEnd().split('\n');

    const parser = new CsvFileParserService();
    expect(parser.parse(Buffer.from(headerRow, 'utf8'))).toEqual([]);
  });
});
