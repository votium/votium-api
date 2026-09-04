import { ElectionEntity, type ElectionStatus } from '../entities/election.entity';

export const ELECTION_REPOSITORY = 'ElectionRepository';

export type ElectionListParams = {
  page: number;
  limit: number;
  // Partial, case-insensitive match on the election name.
  name?: string;
  // Lifecycle status filter.
  status?: ElectionStatus;
  // Election start_date >= startDate (UTC midnight).
  startDate?: Date;
  // Election end_date <= endDate (UTC midnight).
  endDate?: Date;
  // true  → election start instant <= now <= end instant (schedule-active)
  // false → election NOT in that window
  // undefined → no schedule filter
  active?: boolean;
  // Reference instant for the schedule-active window. Defaults to the current time
  // (UTC). Primarily used by tests to exercise boundary conditions deterministically.
  now?: Date;
};

export type ElectionListResult = {
  elections: ElectionEntity[];
  total: number;
};

export interface ElectionRepository {
  // Returns a paginated list of elections matching the optional filters, with a
  // count of the total matches (used for pagination metadata). Filters combine with
  // AND. `active` is schedule-based: the election has started (start date+time <=
  // now, UTC) and has not ended yet (end date+time >= now, UTC). When `active` is
  // undefined no schedule filter is applied. `now` is the reference instant for the
  // schedule window (defaults to the current time). Ordered by created_at desc.
  findAll(params: ElectionListParams): Promise<ElectionListResult>;

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

  // Atomically updates the election status AND records the transition in
  // ElectionStatusHistory (election_id, user_id, old_status, new_status) within a
  // single transaction. Returns the updated election, or null when the id does not
  // exist (P2025). This is the dedicated lifecycle-transition path (e.g. CREATED→PENDING);
  // the regular update() never touches current_status.
  updateStatus(
    id: string,
    status: ElectionStatus,
    requestingUserId: string,
  ): Promise<ElectionEntity | null>;

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
