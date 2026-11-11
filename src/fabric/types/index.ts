import { FabricProfile } from '../fabric.constants';

export interface TxResult<T> {
  data: T;
  txId: string;
  /** null when the result was recovered by reconciliation and the block is unknown */
  blockNumber: number | null;
  /** true when the first attempt had an unknown outcome and the result comes from a retry or from reading the ledger */
  recovered?: boolean;
}
export interface ReadOptions {
  profile?: FabricProfile;
}

export type ElectionStatus = 'CREATED' | 'ACTIVE' | 'CLOSED' | 'PUBLISHED' | 'CANCELED';

export interface Election {
  docType: 'election';
  electionId: string;
  name: string;
  startDate: string;
  endDate: string;
  status: ElectionStatus;
  signingPublicKey: string;
  createdBy: string;
  updatedBy: string;
  timeline: {
    createdAt: string;
    startedAt?: string;
    closedAt?: string;
    publishedAt?: string;
    canceledAt?: string;
  }; // fields after createdAt: [inferido]
}

export interface Candidate {
  docType: 'candidate';
  electionId: string;
  candidateId: string;
  name: string;
  registeredBy: string;
  registeredAt: string;
}

export type VoterStatus = 'ELIGIBLE' | 'ISSUED' | 'VOTED' | 'NOT_FOUND';
export interface RegisterVotersResult {
  received: number;
  inserted: number;
  skipped: number;
}
export interface VoterStatusResult {
  electionId: string;
  voterHash: string;
  status: VoterStatus;
  tokenActive: boolean;
  tokenExpiresAt?: string;
  canIssueToken: boolean;
}
export interface IssueTokenResult {
  tokenExpiresAt: string;
  issuedCount: number;
}
export interface VoterRejection {
  voterHash: string;
  reason: 'NOT_IN_ROLL' | 'NO_TOKEN_ISSUED';
}
export interface MarkVotedResult {
  electionId?: string; // present in MarkVoted; [inferido] in MarkVotedBatch
  marked: number;
  alreadyVoted: number;
  rejected: VoterRejection[]; // always empty in MarkVoted
}

export interface CastVoteResult {
  electionId: string;
  nullifier: string;
  accepted: true;
}
export interface Vote {
  candidateId: string;
  nullifier: string;
  signature: string;
  electionId?: string;
} // [inferido]
export interface VotesPage {
  count: number;
  hasMore: boolean;
  nextBookmark: string;
  votes: Vote[];
}
export interface Tally {
  status: ElectionStatus;
  total: number;
  results: Array<{ candidateId: string; name: string; votes: number }>;
}
