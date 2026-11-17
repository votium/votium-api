import { ResultEntity } from '../../domain/entities/result.entity';
import { ElectionResultsResponseDto } from '../dtos/election-results-response.dto';

export class ElectionResultsPresenter {
  static toResponse(results: ResultEntity): ElectionResultsResponseDto {
    return {
      electionId: results.electionId,
      total: results.total,
      registeredVoters: results.registeredVoters,
      electionStatus: results.electionStatus,
      candidacies: results.candidacies.map((c) => ({
        candidateId: c.candidateId,
        name: c.name,
        votes: c.votes,
      })),
    };
  }
}
