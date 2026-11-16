export const ELECTION_RESULT_REPOSITORY = 'ElectionResultRepository';

export interface ElectionResultCandidacyRef {
  // results.candidacy_id
  id: string;
  // candidacies.candidate_id: the identifier registered in the ledger.
  candidateId: string;
}

export interface ElectionResultVoteCount {
  candidacyId: string;
  votes: number;
}

export interface ElectionResultRepository {
  // Every candidacy of the election, including those of INACTIVE candidates, by position.
  findCandidacyRefsByElection(electionId: string): Promise<ElectionResultCandidacyRef[]>;

  // Upserts each row and sets votes to 0 on any other row of the election.
  // Transactional and idempotent. Returns the number of rows given.
  synchronize(electionId: string, rows: ElectionResultVoteCount[]): Promise<number>;
}
