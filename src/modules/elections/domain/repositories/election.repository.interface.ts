import { ElectionEntity } from '../entities/election.entity';

export const ELECTION_REPOSITORY = 'ElectionRepository';

export interface ElectionRepository {
  // Persists a NEW election. Prisma generates id and created_at, and the
  // database enforces name uniqueness (@@unique([name])) by rejecting duplicates
  // with P2002, which the implementation maps to ElectionNameConflictError.
  create(entity: ElectionEntity): Promise<ElectionEntity>;

  // Returns the election with the given id, or null when it does not exist.
  findById(id: string): Promise<ElectionEntity | null>;

  // Updates ONLY the editable fields present on the entity. Returns the updated
  // election. Throws ElectionNotFoundError when the row no longer exists (P2025)
  // and ElectionNameConflictError when a unique constraint (name) rejects it (P2002).
  update(entity: ElectionEntity): Promise<ElectionEntity>;

  // Whether any candidate/candidacy is associated with the election. Count-based
  // existence check; does not load the collection into memory.
  hasCandidates(electionId: string): Promise<boolean>;

  // Whether any vote (voteMetadata) is associated with the election. Count-based
  // existence check; does not load the collection into memory.
  hasVotes(electionId: string): Promise<boolean>;

  // Physically deletes the election. Must be transactional and must guarantee no
  // partial deletion (either the whole election graph is removed or nothing).
  // Throws ElectionNotFoundError when the row no longer exists (P2025).
  delete(id: string): Promise<void>;
}
