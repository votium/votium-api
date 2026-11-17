import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { ElectionPublishedEvent } from '../events/election-published.event';
import { SyncElectionResultsUseCase } from '../use-cases/sync-election-results.use-case';

@Injectable()
export class ElectionPublishedListener {
  private readonly logger = new Logger(ElectionPublishedListener.name);

  constructor(private readonly syncElectionResultsUseCase: SyncElectionResultsUseCase) {}

  @OnEvent('election.published', { async: true })
  async handle(event: ElectionPublishedEvent): Promise<void> {
    try {
      this.logger.log('[LISTENER] ElectionPublishedListener inicializado');
      await this.syncElectionResultsUseCase.execute(event.electionId);
    } catch (error) {
      this.logger.error(
        `Error procesando la elección ${event.electionId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
