import { CandidateEntity } from '../entities/candidate.entity';
import type { UpdateCandidateInput } from '../entities/update-candidate-input';

export const CANDIDATE_REPOSITORY = 'CandidateRepository';

export interface CandidateSearchParams {
  firstName?: string;
  lastName?: string;
  studyPlanCode?: string;
  studentCode?: string;
  identificationNumber?: string;
}

export interface CandidateRepository {
  // Persists a NEW candidate. Prisma generates id and created_at.
  // Throws CandidateDuplicateError when a unique constraint rejects the row.
  create(entity: CandidateEntity): Promise<CandidateEntity>;

  // Returns the candidate with the given id, or null when it does not exist.
  // Does not filter by status (needed for existence checks and idempotent deactivation).
  findById(id: string): Promise<CandidateEntity | null>;

  // Updates ONLY the candidate's status. Returns the updated candidate, or null
  // when the id does not exist. Never performs a physical deletion.
  updateStatus(id: string, status: string): Promise<CandidateEntity | null>;

  // Updates ONLY the editable fields present in input. Returns the updated
  // candidate, or null when the id does not exist. Throws CandidateDuplicateError
  // when a unique constraint (e.g. identificationNumber) rejects the row.
  update(id: string, input: UpdateCandidateInput): Promise<CandidateEntity | null>;

  // Returns all candidates matching the optional filters, EXCLUDING logically
  // deleted (INACTIVE) candidates. Filters combine with AND. firstName/lastName
  // match case-insensitively and partially; code fields match exactly. Empty or
  // whitespace-only values are ignored. Read-only, ordered by created_at desc.
  search(params: CandidateSearchParams): Promise<CandidateEntity[]>;
}
