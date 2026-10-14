export const ELECTORAL_REGISTRY_TEMPLATE_FILENAME = 'plantilla_carga_votantes.csv';

export interface ElectoralRegistryCsvColumn {
  header: string;
  description: string;
}

// Single source of truth for the elector bulk-upload CSV contract.
//
// The order MUST match the positional order consumed by CsvFileParserService:
//   const [studentCode, firstName, lastName, programCode, email] = cells;
//
// Headers are the exact machine-readable names (not translated). Descriptions are
// Spanish and document only the rules the importer actually enforces.
export const ELECTORAL_REGISTRY_CSV_COLUMNS: ElectoralRegistryCsvColumn[] = [
  {
    header: 'studentCode',
    description:
      'Código del estudiante. Campo obligatorio. Debe ser único: no puede repetirse dentro del archivo, ni existir previamente en el sistema.',
  },
  {
    header: 'firstName',
    description: 'Nombre del votante. Campo obligatorio. Texto.',
  },
  {
    header: 'lastName',
    description: 'Apellido del votante. Campo obligatorio. Texto.',
  },
  {
    header: 'programCode',
    description:
      'Código del programa académico. Campo obligatorio. Debe contener exactamente cuatro dígitos (0-9).',
  },
  {
    header: 'email',
    description:
      'Correo electrónico del votante. Campo obligatorio. Debe ser único: no puede repetirse dentro del archivo, ni existir previamente en el sistema.',
  },
];
