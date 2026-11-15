export interface BallotCandidateExtra {
  candidateId: string; // = Candidacy.id
  photoUrl: string | null;
  position: string;
}

export abstract class BallotCandidateReader {
  abstract findByElection(electionId: string): Promise<BallotCandidateExtra[]>;
}
