export interface CandidacyDto {
  id: string;
  positionNumber: number;
  election: {
    id: string;
  };
  candidate: {
    id: string;
    name: string;
  };
}

export interface ElectionCandidatesPort {
  getCandidaciesByElection(electionId: string): Promise<CandidacyDto[]>;
}

export const ELECTION_CANDIDATES_PORT = Symbol('ELECTION_CANDIDATES_PORT');
