import { ElectoralRollEntity } from '../entities/electoral-roll.entity';

export const ELECTORAL_ROLL_REPOSITORY = 'ElectoralRollRepository';

export type ElectionParticipationCount = { electionId: string; total: number };

export type ActiveParticipationCounts = {
  activeElections: number;
  participatedElections: number;
};

export interface ElectoralRollRepository {
  // Find all rolls for a given election matching any of the provided elector IDs.
  findByElectionAndElectorIds(
    electionId: string,
    electorIds: string[],
  ): Promise<ElectoralRollEntity[]>;

  // Bulk register: insert many rolls in one operation.
  // Uses skipDuplicates for idempotency on the @@unique constraint.
  createMany(electionId: string, electorIds: string[]): Promise<number>;

  // Count existing rolls for an election.
  countByElection(electionId: string): Promise<number>;

  // Batch count of rolls per election in a single query. Elections with no rolls
  // are omitted from the result. Returns [] for an empty input.
  countByElectionIds(electionIds: string[]): Promise<Array<{ electionId: string; total: number }>>;

  // Removes the association between an election and an elector. Returns true
  // when a row was deleted, false when no association existed.
  deleteByElectionAndElectorId(electionId: string, electorId: string): Promise<boolean>;

  findByElectionId(electionId: string): Promise<ElectoralRollEntity[]>;
  // Returns the has_voted flag of the (election, elector) roll row, or null when the
  // elector is not registered in the election's roll. Reads ONLY has_voted, never vote data.
  findHasVoted(electionId: string, electorId: string): Promise<boolean | null>;

  // Batch count of rolls with has_voted = true per election (unique voters thanks to
  // @@unique([election_id, elector_id])). Elections with no voters are omitted.
  // Returns [] for an empty input. Read-only; never reads vote content.
  countVotedByElectionIds(electionIds: string[]): Promise<ElectionParticipationCount[]>;

  // Participation summary of the elector in ACTIVE elections whose roll includes them.
  // activeElections counts (ACTIVE election, elector) rows; participatedElections counts
  // the same rows with has_voted = true. Zeros when there are none. Read-only; never
  // reads vote content.
  countActiveParticipationByElector(electorId: string): Promise<ActiveParticipationCounts>;
}
