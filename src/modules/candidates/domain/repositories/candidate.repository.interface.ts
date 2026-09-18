import { CandidateEntity, type CandidateStatus } from '../entities/candidate.entity';
import type { UpdateCandidateInput } from '../entities/update-candidate-input';

export const CANDIDATE_REPOSITORY = 'CandidateRepository';

export interface CandidateSearchParams {
  page: number;
  limit: number;
  firstName?: string;
  lastName?: string;
  name?: string;
  programCode?: string;
  studentCode?: string;
  identificationNumber?: string;
  status?: CandidateStatus;
}

export interface CandidateSearchResult {
  candidates: CandidateEntity[];
  total: number;
}

export interface CandidateRepository {
  // Persists a NEW candidate. Prisma generates id and created_at.
  // Throws CandidateDuplicateError when a unique constraint rejects the row.
  create(entity: CandidateEntity): Promise<CandidateEntity>;

  // Returns the candidate with the given id, or null when it does not exist or
  // has been logically deleted (`deleted_at != null`).
  findById(id: string): Promise<CandidateEntity | null>;

  // Logically deletes the candidate by setting `deleted_at`. Returns the updated
  // candidate, or null when the id does not exist. Does not change `status` and
  // never performs a physical deletion.
  softDelete(id: string): Promise<CandidateEntity | null>;

  // Updates ONLY the candidate's status. Returns the updated candidate, or null
  // when the id does not exist. Never performs a physical deletion. Callers must
  // validate existence through findById first, which excludes logically deleted rows.
  updateStatus(id: string, status: string): Promise<CandidateEntity | null>;

  // Updates ONLY the editable fields present in input. Returns the updated
  // candidate, or null when the id does not exist. Throws CandidateDuplicateError
  // when a unique constraint (e.g. identificationNumber) rejects the row. Callers
  // must validate existence through findById first, which excludes logically
  // deleted rows.
  update(id: string, input: UpdateCandidateInput): Promise<CandidateEntity | null>;

  // Returns a page of candidates matching the optional filters plus the total
  // number of matches (unpaginated). Filters combine with AND. firstName/lastName
  // match case-insensitively and partially; `name` matches either firstName or
  // lastName (partial, case-insensitive); code fields and `status` match exactly.
  // Empty or whitespace-only values are ignored. Logically deleted candidates
  // (`deleted_at != null`) are always EXCLUDED; candidates of every status are
  // included by default and `status` narrows the result to a single status.
  // page/limit are 1-based; rows are ordered by created_at desc. Read-only.
  search(params: CandidateSearchParams): Promise<CandidateSearchResult>;
}
