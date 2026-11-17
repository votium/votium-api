import { Injectable, Inject } from '@nestjs/common';
import { ElectionResultsPort } from '../ports/election-results.port';
import {
  type ResultsRepository,
  RESULTS_REPOSITORY,
} from '../../domain/repositories/results.repository.interface';
import { ResultEntity } from '../../domain/entities/result.entity';

@Injectable()
export class SyncElectionResultsUseCase {
  constructor(
    private readonly electionResultsPort: ElectionResultsPort,
    @Inject(RESULTS_REPOSITORY)
    private readonly resultsRepository: ResultsRepository,
  ) {}

  async execute(electionId: string): Promise<void> {
    const tally = await this.electionResultsPort.tally(electionId);

    const resultEntity = ResultEntity.create({
      total: tally.total,
      electionStatus: tally.status,
      electionId,
      candidacies: tally.results.map((entry) => ({
        candidateId: entry.candidateId,
        name: entry.name,
        votes: entry.votes,
      })),
    });

    await this.resultsRepository.saveResult(resultEntity);
  }
}
