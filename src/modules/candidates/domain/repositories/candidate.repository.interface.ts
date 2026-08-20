import { CandidateEntity } from '../entities/candidate.entity';

export const CANDIDATE_REPOSITORY = 'CandidateRepository';

export interface CandidateRepository {
  // Persists a NEW candidate. Prisma generates id and created_at.
  // Throws CandidateDuplicateError when a unique constraint rejects the row.
  create(entity: CandidateEntity): Promise<CandidateEntity>;

  // Returns the candidate with the given id, or null when it does not exist.
  findById(id: string): Promise<CandidateEntity | null>;

  // Updates ONLY the candidate's status. Returns the updated candidate, or null
  // when the id does not exist. Never performs a physical deletion.
  updateStatus(id: string, status: string): Promise<CandidateEntity | null>;
}
