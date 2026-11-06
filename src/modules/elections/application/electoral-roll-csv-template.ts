export const ELECTORAL_ROLL_TEMPLATE_FILENAME = 'plantilla_padron_electoral.csv';

// Prefix that marks the guidance row. The importer skips a leading row whose first
// cell starts with this prefix, so a completed template can be submitted without
// removing the guidance row. Data rows never carry this prefix.
export const ELECTORAL_ROLL_GUIDANCE_ROW_PREFIX = '#';

export interface ElectoralRollCsvColumn {
  header: string;
  description: string;
}

// Single source of truth for the election electoral-roll CSV import contract.
//
// The order MUST match the positional order consumed by
// ElectoralRollCsvFileParserService:
//   const [studentCode, programCode] = cells;
//
// Headers are the exact machine-readable names (not translated). Descriptions are
// Spanish and document only the rules the importer actually enforces.
export const ELECTORAL_ROLL_CSV_COLUMNS: ElectoralRollCsvColumn[] = [
  {
    header: 'studentCode',
    description:
      'Código del estudiante. Campo obligatorio. Se combina con el código del programa para ubicar a un elector existente y activo; no se valida un formato específico.',
  },
  {
    header: 'programCode',
    description:
      'Código del programa académico. Campo obligatorio. Debe contener exactamente cuatro dígitos (0-9).',
  },
];
