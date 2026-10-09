export const VOTE_REPOSITORY = 'VoteRepository';

export interface RecordVoteInput {
  electionId: string;
  electorId: string;
  // Selected candidacy UUID, or "blank" for a blank vote.
  candidacyId: string;
  // Idempotency key supplied by the client, or null when none was provided.
  idempotencyKey: string | null;
  // Reference instant for the registration timestamp.
  now: Date;
}

export type RecordVoteResult =
  | { outcome: 'recorded' }
  | { outcome: 'already_voted' }
  | { outcome: 'election_not_active' };

export interface VoteRepository {
  // Atomically registers a vote in a single transaction:
  //   1. locks the election row (FOR SHARE) and verifies it is still ACTIVE — this
  //      serializes with cancellation so a vote can never commit after the election is
  //      cancelled (returning 'election_not_active' when the election is missing or no
  //      longer ACTIVE);
  //   2. conditionally marks the elector's electoral-roll row as voted
  //      (has_voted false -> true) and records the vote identity (candidacy,
  //      idempotency key, registered_at), incrementing vote_attempts and setting
  //      last_vote_attempt.
  //   3. for candidacy votes only, increments the Result tally.
  // Returns 'recorded' when this caller won the claim, 'already_voted' when a prior
  // request (or a concurrent caller) had already claimed it, or 'election_not_active'
  // when the election is not currently accepting votes. Safe under concurrent callers
  // via the conditional updateMany on has_voted = false and the row lock on the election.
  recordVote(input: RecordVoteInput): Promise<RecordVoteResult>;
}
