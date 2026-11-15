import type { CandidacyRepository } from 'src/modules/candidacies/domain/repositories/candidacy.repository.interface';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import { ResultsNotPublishedError } from '../../domain/errors/results-not-published.error';
import type { AnonymousVotingRepository } from '../../domain/repositories/anonymous-voting.repository.interface';

export interface FinalCandidacyResult {
  candidacyId: string;
  candidateId: string;
  candidateName: string;
  positionNumber: number;
  votes: number;
}

export interface FinalElectionResults {
  electionId: string;
  electionName: string;
  totalVotes: number;
  blankVotes: number;
  candidacies: FinalCandidacyResult[];
}

// Public, read-only final results. Only a PUBLISHED election exposes them.
export class GetFinalElectionResultsUseCase {
  constructor(
    private readonly elections: Pick<ElectionRepository, 'findById'>,
    private readonly candidacies: Pick<CandidacyRepository, 'findByElection'>,
    private readonly votes: Pick<AnonymousVotingRepository, 'tally'>,
  ) {}

  async execute(electionId: string): Promise<FinalElectionResults> {
    const election = await this.elections.findById(electionId);
    if (!election) throw new ElectionNotFoundError(electionId);
    if (election.currentStatus !== 'PUBLISHED') throw new ResultsNotPublishedError();

    const visible = await this.candidacies.findByElection(electionId);
    const rows = await this.votes.tally(electionId);

    const votesByCandidacy = new Map<string, number>();
    let blankVotes = 0;
    let totalVotes = 0;
    for (const row of rows) {
      totalVotes += row.votes;
      if (row.candidacyId === null) {
        blankVotes += row.votes;
      } else {
        votesByCandidacy.set(
          row.candidacyId,
          (votesByCandidacy.get(row.candidacyId) ?? 0) + row.votes,
        );
      }
    }

    // Votes for a candidacy no longer listed (inactive/deleted candidate) still count in
    // totalVotes, but no row is invented for it. findByElection already orders by position.
    const candidacies = visible.map((candidacy) => ({
      candidacyId: candidacy.id,
      candidateId: candidacy.candidateId,
      candidateName: `${candidacy.candidateFirstName} ${candidacy.candidateLastName}`.trim(),
      positionNumber: candidacy.positionNumber,
      votes: votesByCandidacy.get(candidacy.id) ?? 0,
    }));

    return { electionId, electionName: election.name, totalVotes, blankVotes, candidacies };
  }
}
