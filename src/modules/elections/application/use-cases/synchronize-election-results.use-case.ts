import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import { ElectionNotPublishedError } from '../../domain/errors/election-not-published.error';
import { ElectionResultsSyncInconsistentError } from '../../domain/errors/election-results-sync-inconsistent.error';
import type { ElectionResultRepository } from '../../domain/repositories/election-result.repository.interface';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';
import type { ElectionResultsPort } from '../ports/election-results.port';

export interface SynchronizeElectionResultsResult {
  electionId: string;
  synchronized: boolean;
  candidaciesSynchronized: number;
  totalVotes: number;
}

// Copies the votes per candidacy from the ledger (source of truth) into `results`.
// Shared by the election.published listener and the manual endpoint. Never changes
// the election status and writes no audit entries.
export class SynchronizeElectionResultsUseCase {
  constructor(
    private readonly elections: Pick<ElectionRepository, 'findById'>,
    private readonly ledger: ElectionResultsPort,
    private readonly results: Pick<
      ElectionResultRepository,
      'findCandidacyRefsByElection' | 'synchronize'
    >,
  ) {}

  async execute(input: { electionId: string }): Promise<SynchronizeElectionResultsResult> {
    const { electionId } = input;

    const election = await this.elections.findById(electionId);
    if (!election) throw new ElectionNotFoundError(electionId);
    if (election.currentStatus !== 'PUBLISHED') throw new ElectionNotPublishedError();

    const refs = await this.results.findCandidacyRefsByElection(electionId);
    // Ledger failures (FabricError) propagate untouched; FabricExceptionFilter maps them.
    const tally = await this.ledger.tally(electionId);

    // The ledger registers the candidate id; the candidacy id is accepted as a fallback.
    const byCandidacyId = new Map(refs.map((ref) => [ref.id, ref.id]));
    const byCandidateId = new Map(refs.map((ref) => [ref.candidateId, ref.id]));
    const votesByCandidacy = new Map<string, number>();

    // Validate everything before writing anything.
    for (const entry of tally.results) {
      if (!Number.isInteger(entry.votes) || entry.votes < 0) {
        throw new ElectionResultsSyncInconsistentError();
      }
      const candidacyId =
        byCandidacyId.get(entry.candidateId) ?? byCandidateId.get(entry.candidateId);
      if (!candidacyId) throw new ElectionResultsSyncInconsistentError();

      votesByCandidacy.set(candidacyId, (votesByCandidacy.get(candidacyId) ?? 0) + entry.votes);
    }

    const rows = refs.map((ref) => ({
      candidacyId: ref.id,
      votes: votesByCandidacy.get(ref.id) ?? 0,
    }));

    await this.results.synchronize(electionId, rows);

    return {
      electionId,
      synchronized: true,
      candidaciesSynchronized: rows.length,
      totalVotes: rows.reduce((total, row) => total + row.votes, 0),
    };
  }
}
