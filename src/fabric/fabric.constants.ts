export const FABRIC_PROFILES = ['writer', 'auditor'] as const;
export type FabricProfile = (typeof FABRIC_PROFILES)[number];

/** Built-in contract that every Node chaincode exposes. */
export const SYSTEM_CONTRACT = 'org.hyperledger.fabric';

/** Chaincode catalogue. Single source for the typed services (Phase 2) and the smoke test. */
export const CHAINCODES = {
  elections: {
    contract: 'Elections',
    functions: [
      'CreateElection',
      'StartElection',
      'CancelElection',
      'CloseElection',
      'PublishElection',
      'GetElection',
      'ListElections',
    ],
  },
  candidates: {
    contract: 'Candidates',
    functions: ['RegisterCandidate', 'GetCandidate', 'ListCandidates'],
  },
  voters: {
    contract: 'Voters',
    functions: ['RegisterVoters', 'GetVoterStatus', 'IssueToken', 'MarkVoted', 'MarkVotedBatch'],
  },
  voting: {
    contract: 'Voting',
    functions: ['CastVote', 'GetVotesByElection', 'GetTally'],
  },
} as const;
export type ChaincodeName = keyof typeof CHAINCODES;
