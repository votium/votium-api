export interface RecordElectionBlockchainLogInput {
  actorId: string;
  actionType:
    | 'CREATE_ELECTION'
    | 'START_ELECTION'
    | 'CLOSE_ELECTION'
    | 'PUBLISH_ELECTION'
    | 'CANCEL_ELECTION'
    | 'SYNC_ELECTION_RESULTS';
  electionId: string;
  status: 'PENDING' | 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED' | 'COMPENSATED';
  summary: string;
  transactions: {
    step: string;
    txId: string;
    status: string;
    blockNumber: number;
    errorMessage?: string;
  }[];
}

export abstract class ElectionAuditPort {
  abstract recordBlockchainAction(input: RecordElectionBlockchainLogInput): Promise<{ id: number }>;
  abstract updateBlockchainActionStatus(
    id: number,
    newStatus: string,
    transactions?: {
      step: string;
      txId: string;
      status: string;
      blockNumber: number;
      errorMessage?: string;
    }[],
  ): Promise<void>;
}
