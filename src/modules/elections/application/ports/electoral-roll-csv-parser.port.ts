export const ELECTORAL_ROLL_CSV_PARSER_PORT = 'ElectoralRollCsvParserPort';

export interface ElectoralRollCsvRow {
  studentCode: string;
  programCode: string;
}

export interface ElectoralRollCsvParserPort {
  // Decodes the buffer as UTF-8, parses the CSV, skips the optional header and empty
  // rows, validates the structure, and returns typed rows.
  // Throws BadRequestException with descriptive messages on structural errors.
  parse(buffer: Buffer): ElectoralRollCsvRow[];
}
