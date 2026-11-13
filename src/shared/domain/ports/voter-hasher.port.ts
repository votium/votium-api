export interface VoterHashPayload {
  electionId: string;
  electorId: string;
}

export interface VoterHasherPort {
  hash(payload: VoterHashPayload): Promise<string>;
  hashBatch(payloads: VoterHashPayload[]): Promise<string[]>;
}

export const VOTER_HASHER_PORT = Symbol('VOTER_HASHER_PORT');
