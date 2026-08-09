import { ElectorEntity } from '../entities/elector.entity';

export const ELECTOR_REPOSITORY = 'ElectorRepository';

export interface ElectorRepository {
  // Persists a NEW elector. Prisma generates id and created_at.
  // Throws ElectorDuplicateError when a unique constraint rejects the row.
  create(entity: ElectorEntity): Promise<ElectorEntity>;
}
