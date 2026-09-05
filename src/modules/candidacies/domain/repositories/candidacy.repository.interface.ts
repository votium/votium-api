import { CandidacyEntity } from '../entities/candidacy.entity';

export const CANDIDACY_REPOSITORY = 'CandidacyRepository';

export interface CandidacyRepository {
  // Returns the highest positionNumber already assigned for the election, for
  // computing the next available position. Returns 0 when no candidacy exists.
  findMaxPosition(electionId: string): Promise<number>;

  // Persists a NEW candidacy. Prisma generates id and created_at. Maps the
  // unique (candidate_id, election_id) / (position_number, election_id)
  // violations to CandidacyDuplicateError.
  create(entity: CandidacyEntity): Promise<CandidacyEntity>;
}
