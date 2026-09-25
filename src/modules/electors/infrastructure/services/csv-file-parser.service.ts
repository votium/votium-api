import { Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';
import { type CsvParserPort, type ElectorCsvRow } from '../../application/ports/csv-parser.port';

@Injectable()
export class CsvFileParserService implements CsvParserPort {
  parse(buffer: Buffer): ElectorCsvRow[] {
    const content = this.decodeUtf8(buffer);

    let records: string[][];
    try {
      records = parse(content, {
        delimiter: ',',
        bom: true,
        skip_empty_lines: true,
        relax_column_count: true,
      }) as string[][];
    } catch {
      throw new BadRequestException('Invalid CSV format.');
    }

    const rows: ElectorCsvRow[] = [];

    for (const [index, record] of records.entries()) {
      const cells = record.map((cell) => cell.trim());

      if (index === 0 && looksLikeHeader(cells)) {
        continue;
      }

      if (cells.length !== 5) {
        throw new BadRequestException('Each CSV row must contain exactly five columns.');
      }

      const [studentCode, firstName, lastName, programCode, email] = cells;

      if (!studentCode || !firstName || !lastName || !programCode || !email) {
        throw new BadRequestException('CSV contains incomplete rows.');
      }

      if (!/^\d{4}$/.test(programCode)) {
        throw new BadRequestException('Program code must contain exactly four digits.');
      }

      rows.push({ studentCode, firstName, lastName, programCode, email });
    }

    return rows;
  }

  private decodeUtf8(buffer: Buffer): string {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      throw new BadRequestException('Invalid CSV format.');
    }
  }
}

function looksLikeHeader(cells: string[]): boolean {
  const studentCodeCell = cells[0] ?? '';
  return studentCodeCell !== '' && !/^\d+$/.test(studentCodeCell);
}
