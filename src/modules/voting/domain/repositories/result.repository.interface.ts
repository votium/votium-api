export const RESULT_REPOSITORY = 'ResultRepository';

export interface ResultRepository {
  // Atomically increments Result.votes for (electionId, candidacyId), creating the
  // row with votes = 1 when absent. Safe under concurrent callers (no
  // read-modify-write that can lose increments).
  incrementVotes(electionId: string, candidacyId: string): Promise<void>;
}
