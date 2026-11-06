import { ELECTORAL_REGISTRY_CSV_COLUMNS } from '../electoral-registry-template';

export class GetElectoralRegistryTemplateUseCase {
  // Returns the official elector bulk-upload CSV template:
  //   row 1 — machine-readable headers (exact import order)
  //   row 2 — one Spanish description per header
  // Deterministic: no timestamps, IDs, randomness, or database access.
  execute(): string {
    const headers = ELECTORAL_REGISTRY_CSV_COLUMNS.map((column) => column.header);
    const descriptions = ELECTORAL_REGISTRY_CSV_COLUMNS.map((column) => column.description);

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
