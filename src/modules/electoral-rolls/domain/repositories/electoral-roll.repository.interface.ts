import { ElectoralRollEntity } from '../entities/electoral-roll.entity';

export const ELECTORAL_ROLL_REPOSITORY = 'ElectoralRollRepository';

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
}
