import { ElectorEntity } from '../entities/elector.entity';

export const ELECTOR_REPOSITORY = 'ElectorRepository';

export interface ElectorListParams {
  page: number;
  limit: number;
  programCode?: string;
  studentCode?: string;
  name?: string;
}

export interface ElectorRepository {
  // Persists a NEW elector. Prisma generates id and created_at.
  // Throws ElectorDuplicateError when a unique constraint rejects the row.
  create(entity: ElectorEntity): Promise<ElectorEntity>;

  // Searches electors applying only the supplied filters at the database level.
  // Returns the page of matching electors and the total number of matches.
  findAll(params: ElectorListParams): Promise<{ electors: ElectorEntity[]; total: number }>;
}
