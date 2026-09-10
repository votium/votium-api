import { ElectorEntity } from '../entities/elector.entity';

export const ELECTOR_REPOSITORY = 'ElectorRepository';

export interface ElectorSearchParams {
  page: number;
  limit: number;
  programCode?: string;
  studentCode?: string;
  name?: string;
}

export interface ElectorSearchResult {
  electors: ElectorEntity[];
  total: number;
}

export interface ElectorRepository {
  // Persists a NEW elector. Prisma generates id and created_at.
  // Throws ElectorDuplicateError when a unique constraint rejects the row.
  create(entity: ElectorEntity): Promise<ElectorEntity>;

  // Returns electors whose student_code or email matches any of the given values.
  findByStudentCodeOrEmail(studentCodes: string[], emails: string[]): Promise<ElectorEntity[]>;

  // Returns the elector with the given id, or null when it does not exist.
  findById(id: string): Promise<ElectorEntity | null>;

  // Updates ONLY the elector's status. Returns the updated elector, or null
  // when the id does not exist. Never performs a physical deletion.
  updateStatus(id: string, status: string): Promise<ElectorEntity | null>;

  // Updates the elector's editable fields (firstName, lastName, email,
  // studentCode, programCode). Returns the updated elector, or null when the
  // id does not exist. Throws ElectorDuplicateError on unique conflicts
  // (email, student_code).
  update(entity: ElectorEntity): Promise<ElectorEntity | null>;

  // Returns the elector whose email matches (case-insensitively), or null.
  findByEmail(email: string): Promise<ElectorEntity | null>;

  // Searches electors using optional exact program_code / student_code filters and a
  // case-insensitive partial name filter. Filters combine with AND. Returns a page
  // of electors plus the total number of matching rows. Read-only.
  search(params: ElectorSearchParams): Promise<ElectorSearchResult>;

  // Find electors matching any of the given (studentCode, programCode) pairs.
  // Returns only electors that match at least one pair exactly.
  findByStudentCodeAndProgramCode(
    pairs: Array<{ studentCode: string; programCode: string }>,
  ): Promise<ElectorEntity[]>;
}
