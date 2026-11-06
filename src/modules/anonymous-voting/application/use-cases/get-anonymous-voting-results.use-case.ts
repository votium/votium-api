import type { CandidacyRepository } from 'src/modules/candidacies/domain/repositories/candidacy.repository.interface';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import { ResultsNotAvailableError } from '../../domain/errors/results-not-available.error';
import type { AnonymousVotingRepository } from '../../domain/repositories/anonymous-voting.repository.interface';

export interface AnonymousVotingResults {
  electionId: string;
  totalVotes: number;
  candidacies: Array<{ candidacyId: string; votes: number }>;
  // Shown as its own line, never added to a candidacy.
  blankVotes: number;
}

export class GetAnonymousVotingResultsUseCase {
  constructor(
    private readonly elections: ElectionRepository,
    private readonly candidacies: CandidacyRepository,
    private readonly repository: AnonymousVotingRepository,
  ) {}

  // Results are published only once the election is over (CLOSED or PUBLISHED).
  async execute(electionId: string): Promise<AnonymousVotingResults> {
    const election = await this.elections.findById(electionId);
    if (!election) throw new ElectionNotFoundError(electionId);
    if (election.currentStatus !== 'CLOSED' && election.currentStatus !== 'PUBLISHED') {
      throw new ResultsNotAvailableError();
    }

    const counts = new Map<string, number>();
    for (const candidacy of await this.candidacies.findByElection(electionId)) {
      counts.set(candidacy.id, 0);
    }

    let blankVotes = 0;
    for (const row of await this.repository.tally(electionId)) {
      if (row.candidacyId === null) {
        blankVotes += row.votes;
      } else {
        // Votes for a candidacy that is no longer listed (e.g. its candidate was deactivated) still count.
        counts.set(row.candidacyId, (counts.get(row.candidacyId) ?? 0) + row.votes);
      }
    }

    const candidacies = [...counts].map(([candidacyId, votes]) => ({ candidacyId, votes }));
    const totalVotes = blankVotes + candidacies.reduce((sum, c) => sum + c.votes, 0);
    return { electionId, totalVotes, candidacies, blankVotes };
  }
}
