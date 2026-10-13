import { Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';
import { ELECTORAL_ROLL_GUIDANCE_ROW_PREFIX } from '../../application/electoral-roll-csv-template';
import {
  type ElectoralRollCsvParserPort,
  type ElectoralRollCsvRow,
} from '../../application/ports/electoral-roll-csv-parser.port';

@Injectable()
export class ElectoralRollCsvFileParserService implements ElectoralRollCsvParserPort {
  parse(buffer: Buffer): ElectoralRollCsvRow[] {
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

    const rows: ElectoralRollCsvRow[] = [];

    // Structural rows are skipped deterministically while still leading:
    //   - the optional header: the first record, with a non-empty non-numeric first cell;
    //   - the guidance row: any leading record whose first cell carries the guidance marker.
    // Data rows never carry the marker and are therefore never skipped.
    let dataStarted = false;

    for (const [index, record] of records.entries()) {
      const cells = record.map((cell) => cell.trim());

      if (!dataStarted && index === 0 && looksLikeHeader(cells)) {
        continue;
      }

      if (!dataStarted && looksLikeGuidanceRow(cells)) {
        continue;
      }

      dataStarted = true;

      if (cells.length !== 2) {
        throw new BadRequestException('Each CSV row must contain exactly two columns.');
      }

      const [studentCode, programCode] = cells;

      if (!studentCode || !programCode) {
        throw new BadRequestException('CSV contains incomplete rows.');
      }

      if (!/^\d{4}$/.test(programCode)) {
        throw new BadRequestException('Program code must contain exactly four digits.');
      }

      rows.push({ studentCode, programCode });
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

// The optional header row: the first cell is non-empty and non-numeric.
function looksLikeHeader(cells: string[]): boolean {
  const studentCodeCell = cells[0] ?? '';
  return studentCodeCell !== '' && !/^\d+$/.test(studentCodeCell);
}

// The template's guidance row: its first cell is marked with the guidance prefix.
function looksLikeGuidanceRow(cells: string[]): boolean {
  return (cells[0] ?? '').startsWith(ELECTORAL_ROLL_GUIDANCE_ROW_PREFIX);
}
