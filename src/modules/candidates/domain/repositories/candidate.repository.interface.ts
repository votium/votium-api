import { CandidateEntity } from '../entities/candidate.entity';

export const CANDIDATE_REPOSITORY = 'CandidateRepository';

export interface CandidateRepository {
  // Persists a NEW candidate. Prisma generates id and created_at.
  // Throws CandidateDuplicateError when a unique constraint rejects the row.
  create(entity: CandidateEntity): Promise<CandidateEntity>;
}
