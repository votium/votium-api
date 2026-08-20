import { CandidateEntity } from '../entities/candidate.entity';

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

  // Returns all candidates matching the optional filters. Filters combine with AND.
  // firstName/lastName match case-insensitively and partially; code fields match exactly.
  // Empty or whitespace-only values are ignored. Read-only, ordered by created_at desc.
  search(params: CandidateSearchParams): Promise<CandidateEntity[]>;
}
