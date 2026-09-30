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

export type RecordVoteResult = { outcome: 'recorded' } | { outcome: 'already_voted' };

export interface VoteRepository {
  // Atomically registers a vote in a single transaction:
  //   1. conditionally marks the elector's electoral-roll row as voted
  //      (has_voted false -> true) and records the vote identity (candidacy,
  //      idempotency key, registered_at), incrementing vote_attempts and setting
  //      last_vote_attempt.
  //   2. for candidacy votes only, increments the Result tally.
  // Returns 'recorded' when this caller won the claim, or 'already_voted' when a
  // prior request (or a concurrent caller) had already claimed it. Safe under
  // concurrent callers via the conditional updateMany on has_voted = false.
  recordVote(input: RecordVoteInput): Promise<RecordVoteResult>;
}
