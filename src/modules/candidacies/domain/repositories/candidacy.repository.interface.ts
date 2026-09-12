import { CandidacyEntity, UpdateCandidacyInput } from '../entities/candidacy.entity';

export const CANDIDACY_REPOSITORY = 'CandidacyRepository';

// Read-model returned by findByElection: a candidacy joined with the minimal
// candidate identity required by the election-candidacies query. This is a
// domain-level projection and never exposes Prisma models.
export interface CandidacyWithCandidate {
  id: string;
  electionId: string;
  candidateId: string;
  candidateFirstName: string;
  candidateLastName: string;
  positionNumber: number;
  imageUrl: string | null;
  createdAt: Date;
}

// Optional filters accepted by findByElection.
export interface CandidacyListParams {
  // Partial, case-insensitive match on the candidate first or last name.
  // Trimmed internally; empty/whitespace-only values are ignored. INACTIVE
  // candidates are always excluded.
  candidateName?: string;
}

export interface CandidacyRepository {
  // Returns the highest positionNumber already assigned for the election, for
  // computing the next available position. Returns 0 when no candidacy exists.
  findMaxPosition(electionId: string): Promise<number>;

  // Persists a NEW candidacy. Prisma generates id and created_at. Maps the
  // unique (candidate_id, election_id) / (position_number, election_id)
  // violations to CandidacyDuplicateError.
  create(entity: CandidacyEntity): Promise<CandidacyEntity>;

  // Returns every candidacy associated with the election, ordered by
  // position_number ascending. INACTIVE candidates are always excluded.
  // When candidateName is provided it performs a partial, case-insensitive
  // match on the candidate first or last name.
  findByElection(
    electionId: string,
    params?: CandidacyListParams,
  ): Promise<CandidacyWithCandidate[]>;

  // Returns the candidacy with the given id, or null when it does not exist.
  findById(id: string): Promise<CandidacyEntity | null>;

  // Updates ONLY the editable fields present in input (positionNumber,
  // imageUrl). `imageUrl: null` clears the stored image; `undefined` leaves
  // it unchanged. Returns the updated candidacy, or null when the id does
  // not exist. Throws CandidacyDuplicateError when the unique constraint
  // (position_number, election_id) rejects the row.
  update(id: string, input: UpdateCandidacyInput): Promise<CandidacyEntity | null>;
}
