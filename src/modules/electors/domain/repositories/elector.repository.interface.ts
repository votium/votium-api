import { ElectorEntity } from '../entities/elector.entity';

export const ELECTOR_REPOSITORY = 'ElectorRepository';

export interface ElectorRepository {
  // Persists a NEW elector. Prisma generates id and created_at.
  // Throws ElectorDuplicateError when a unique constraint rejects the row.
  create(entity: ElectorEntity): Promise<ElectorEntity>;

  // Returns electors whose student_code or email matches any of the given values.
  findByStudentCodeOrEmail(studentCodes: string[], emails: string[]): Promise<ElectorEntity[]>;
}
