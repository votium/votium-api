import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  type ResultsRepository,
  RESULTS_REPOSITORY,
} from '../../domain/repositories/results.repository.interface';
import {
  type ElectoralRollRepository,
  ELECTORAL_ROLL_REPOSITORY,
} from '../../domain/repositories/electoral-roll.repository.interface';

@Injectable()
export class GetElectionResultsUseCase {
  constructor(
    @Inject(RESULTS_REPOSITORY)
    private readonly resultsRepository: ResultsRepository,
    @Inject(ELECTORAL_ROLL_REPOSITORY)
    private readonly electoralRollRepository: ElectoralRollRepository,
  ) {}

  async execute(electionId: string) {
    const [resultEntity, registeredVoters] = await Promise.all([
      this.resultsRepository.getResults(electionId),
      this.electoralRollRepository.countByElection(electionId),
    ]);

    if (!resultEntity) {
      throw new NotFoundException(
        `No results found for election with ID: ${electionId} and status is not PUBLISHED`,
      );
    }

    return resultEntity.withRegisteredVoters(registeredVoters);
  }
}
