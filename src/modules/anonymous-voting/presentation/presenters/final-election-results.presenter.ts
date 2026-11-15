import type { FinalElectionResults } from '../../application/use-cases/get-final-election-results.use-case';
import {
  FinalCandidacyResultResponseDto,
  FinalElectionResultsResponseDto,
} from '../dtos/final-election-results-response.dto';

export class FinalElectionResultsPresenter {
  static toResponse(result: FinalElectionResults): FinalElectionResultsResponseDto {
    return new FinalElectionResultsResponseDto({
      electionId: result.electionId,
      electionName: result.electionName,
      totalVotes: result.totalVotes,
      blankVotes: result.blankVotes,
      candidacies: result.candidacies.map(
        (c) =>
          new FinalCandidacyResultResponseDto({
            candidacyId: c.candidacyId,
            candidateId: c.candidateId,
            candidateName: c.candidateName,
            positionNumber: c.positionNumber,
            votes: c.votes,
          }),
      ),
    });
  }
}
