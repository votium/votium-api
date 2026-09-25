export const CSV_PARSER_PORT = 'CsvParserPort';

export interface ElectorCsvRow {
  studentCode: string;
  firstName: string;
  lastName: string;
  programCode: string;
  email: string;
}

export interface CsvParserPort {
  // Decodes the buffer as UTF-8, parses the CSV, skips the optional header and empty
  // rows, validates the structure, and returns typed rows.
  // Throws BadRequestException with the spec messages on structural errors.
  parse(buffer: Buffer): ElectorCsvRow[];
}
