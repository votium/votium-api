import { ElectorEntity } from '../entities/elector.entity';

export const ELECTOR_REPOSITORY = 'ElectorRepository';

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
}
