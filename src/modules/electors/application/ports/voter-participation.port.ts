export const VOTER_PARTICIPATION_PORT = Symbol('VoterParticipationPort');

export interface VoterParticipationInput {
  electionId: string;
  electorId: string;
}

export interface VoterParticipationPort {
  // true only when the ledger confirms the voter as VOTED for the election.
  hasConfirmedVote(input: VoterParticipationInput): Promise<boolean>;
}
