import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ElectionPublishedEvent } from '../events/election-published.event';
import { SynchronizeElectionResultsUseCase } from '../use-cases/synchronize-election-results.use-case';

@Injectable()
export class ElectionPublishedResultsSyncListener {
  private readonly logger = new Logger(ElectionPublishedResultsSyncListener.name);

  constructor(private readonly synchronize: SynchronizeElectionResultsUseCase) {}

  // Never rethrows: a failed sync leaves the election PUBLISHED and can be retried
  // through POST /elections/:electionId/results/synchronize.
  @OnEvent('election.published', { async: true })
  async handle(event: ElectionPublishedEvent): Promise<void> {
    try {
      await this.synchronize.execute({ electionId: event.electionId });
      this.logger.log(`Resultados sincronizados para ${event.electionId}`);
    } catch (error) {
      this.logger.error(
        `Fallo sincronizando resultados de ${event.electionId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
