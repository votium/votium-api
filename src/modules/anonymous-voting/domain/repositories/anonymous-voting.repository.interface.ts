export const ANONYMOUS_VOTING_REPOSITORY = 'AnonymousVotingRepository';

export interface StoredElectionKey {
  publicKeyPem: string;
  // base64(iv || tag || ciphertext), encrypted with the key-encryption key.
  privateKeyEnc: string;
}

export interface IssueCredentialInput {
  electionId: string;
  electorId: string;
  y: string;
  now: Date;
}

export interface CastAnonymousVoteInput {
  electionId: string;
  ballotId: string;
  // Candidacy UUID, or null for a blank vote.
  candidacyId: string | null;
  now: Date;
}

export interface AnonymousBallotReceipt {
  electionId: string;
  ballotId: string;
  registeredAt: Date;
}

// Votes grouped by candidacy. candidacyId null is the blank-vote row.
export interface TallyRow {
  candidacyId: string | null;
  votes: number;
}

export interface AnonymousVotingRepository {
  findElectionKey(electionId: string): Promise<StoredElectionKey | null>;

  // Stores the key only if none exists for the election (idempotent under concurrency).
  saveElectionKeyIfAbsent(electionId: string, key: StoredElectionKey): Promise<void>;

  // One transaction, with the election row locked (FOR SHARE) and re-checked as ACTIVE. Rejects a
  // second credential for the same elector and a y already registered for the election. Calls
  // `sign` with the stored encrypted private key, then records the credential and the commitment.
  // Throws ElectionNotActiveError, BallotCredentialAlreadyIssuedError, CommitmentAlreadyRegisteredError.
  issueCredential(
    input: IssueCredentialInput,
    sign: (privateKeyEnc: string) => Promise<Uint8Array>,
  ): Promise<Uint8Array>;

  hasCredentialIssued(electionId: string, electorId: string): Promise<boolean>;

  hasCommitment(electionId: string, y: string): Promise<boolean>;

  // One transaction, election row locked and re-checked as ACTIVE. Inserts the anonymous ballot.
  // Throws ElectionNotActiveError, BallotAlreadyUsedError.
  castVote(input: CastAnonymousVoteInput): Promise<void>;

  // Returns the receipt without any candidacy information, or null.
  findReceipt(electionId: string, ballotId: string): Promise<AnonymousBallotReceipt | null>;

  // Aggregated counts of every anonymous ballot of the election.
  tally(electionId: string): Promise<TallyRow[]>;
}
