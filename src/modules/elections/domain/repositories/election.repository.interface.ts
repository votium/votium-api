import { ElectionEntity } from '../entities/election.entity';

export const ELECTION_REPOSITORY = 'ElectionRepository';

export interface ElectionRepository {
  // Persists a NEW election. Prisma generates id and created_at, and the
  // database enforces name uniqueness (@@unique([name])) by rejecting duplicates
  // with P2002, which the implementation maps to ElectionNameConflictError.
  create(entity: ElectionEntity): Promise<ElectionEntity>;
}
