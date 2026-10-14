import {
  ELECTORAL_REGISTRY_CSV_COLUMNS,
  ELECTORAL_REGISTRY_TEMPLATE_FILENAME,
} from './electoral-registry-template';

describe('electoral-registry-template (contract)', () => {
  it('CON-01: headers exactly match the importer positional order', () => {
    expect(ELECTORAL_REGISTRY_CSV_COLUMNS.map((column) => column.header)).toEqual([
      'studentCode',
      'firstName',
      'lastName',
      'programCode',
      'email',
    ]);
  });

  it('CON-02: defines exactly five columns (matches the importer column count)', () => {
    expect(ELECTORAL_REGISTRY_CSV_COLUMNS).toHaveLength(5);
  });

  it('CON-03: every description is a non-empty Spanish string', () => {
    for (const column of ELECTORAL_REGISTRY_CSV_COLUMNS) {
      expect(typeof column.description).toBe('string');
      expect(column.description.trim().length).toBeGreaterThan(0);
      expect(column.description).toMatch(/obligatorio/i);
    }
  });

  it('CON-04: exposes the required download filename', () => {
    expect(ELECTORAL_REGISTRY_TEMPLATE_FILENAME).toBe('plantilla_carga_votantes.csv');
  });
});
