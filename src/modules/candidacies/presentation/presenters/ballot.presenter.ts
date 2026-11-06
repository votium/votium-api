import type { ElectionBallotResult } from '../../application/use-cases/get-election-ballot.use-case';
import { BallotElectionDto, BlankVoteDto, BallotResponseDto } from '../dtos/ballot-response.dto';
import { CandidacyPresenter } from './candidacy.presenter';

export class BallotPresenter {
  static toResponse(result: ElectionBallotResult): BallotResponseDto {
    return new BallotResponseDto({
      election: new BallotElectionDto({
        id: result.electionId,
        name: result.electionName,
      }),
      candidacies: result.candidacies.map((candidacy) =>
        CandidacyPresenter.toCandidacyWithCandidate(candidacy),
      ),
      blankVote: new BlankVoteDto({
        id: result.blankVote.id,
        enabled: result.blankVote.enabled,
      }),
    });
  }
}
