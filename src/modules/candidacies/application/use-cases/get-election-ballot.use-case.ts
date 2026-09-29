import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type {
  CandidacyRepository,
  CandidacyWithCandidate,
} from '../../domain/repositories/candidacy.repository.interface';
import { ElectionNoValidCandidatesError } from '../../domain/errors/election-no-valid-candidates.error';

export const BLANK_VOTE_OPTION_ID = 'blank';

export interface BlankVoteOption {
  id: string;
  enabled: boolean;
}

export interface GetElectionBallotQuery {
  electionId: string;
}

export interface ElectionBallotResult {
  electionId: string;
  electionName: string;
  blankVote: BlankVoteOption;
  candidacies: CandidacyWithCandidate[];
}

export class GetElectionBallotUseCase {
  constructor(
    private readonly elections: ElectionRepository,
    private readonly candidacies: CandidacyRepository,
  ) {}

  async execute(params: GetElectionBallotQuery): Promise<ElectionBallotResult> {
    const election = await this.elections.findById(params.electionId);
    if (!election) {
      throw new ElectionNotFoundError(params.electionId);
    }

    // findByElection already excludes INACTIVE candidates and orders by
    // position_number ascending, so the ballot preserves candidate numbers
    // and has deterministic ordering without renumbering.
    const candidacies = await this.candidacies.findByElection(params.electionId);
    if (candidacies.length === 0) {
      throw new ElectionNoValidCandidatesError(params.electionId);
    }

    // The blank-vote option availability mirrors the election's blank_vote_enabled
    // flag (single source of truth shared with the vote-registration endpoint). The
    // endpoint is read-only and never writes to the database.
    return {
      electionId: params.electionId,
      electionName: election.name,
      blankVote: { id: BLANK_VOTE_OPTION_ID, enabled: election.blankVoteEnabled },
      candidacies,
    };
  }
}
