export interface ElectionTallyEntry {
  candidateId: string;
  name: string;
  votes: number;
}

export interface ElectionTally {
  status: string;
  total: number;
  results: ElectionTallyEntry[];
}

// Abstract class (same pattern as ElectionLedgerPort) so it can be bound with useExisting.
export abstract class ElectionResultsPort {
  abstract tally(electionId: string): Promise<ElectionTally>;
}
