import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';
import {
  ELECTORAL_ROLL_CSV_COLUMNS,
  ELECTORAL_ROLL_GUIDANCE_ROW_PREFIX,
} from '../electoral-roll-csv-template';

export class GetElectoralRollTemplateUseCase {
  constructor(private readonly elections: ElectionRepository) {}

  // Returns the official election electoral-roll CSV template:
  //   row 1 — machine-readable headers (exact import order)
  //   row 2 — one Spanish description per header, each prefixed with the guidance
  //           marker so the importer can skip it deterministically
  //
  // Downloading is a read operation: only election existence is validated. The
  // template columns are static across elections and do not depend on lifecycle
  // state, so no `isRollLoadable()`/lifecycle gate is applied.
  async execute(electionId: string): Promise<string> {
    const election = await this.elections.findById(electionId);
    if (!election) {
      throw new ElectionNotFoundError(electionId);
    }

    const headers = ELECTORAL_ROLL_CSV_COLUMNS.map((column) => column.header);
    const descriptions = ELECTORAL_ROLL_CSV_COLUMNS.map(
      (column) => `${ELECTORAL_ROLL_GUIDANCE_ROW_PREFIX} ${column.description}`,
    );

    return `${serializeCsvRow(headers)}\n${serializeCsvRow(descriptions)}\n`;
  }
}

// RFC-4180 serializer: quote a cell when it contains a comma, double quote,
// carriage return, or line feed; escape internal double quotes by doubling them.
function serializeCsvRow(cells: string[]): string {
  return cells.map(serializeCsvCell).join(',');
}

function serializeCsvCell(cell: string): string {
  if (!/[",\r\n]/.test(cell)) {
    return cell;
  }

  return `"${cell.replace(/"/g, '""')}"`;
}
