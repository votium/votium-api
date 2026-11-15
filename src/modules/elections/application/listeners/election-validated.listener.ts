import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { ElectionValidatedEvent } from '../events/election-validated.event';
import { RegisterElectionToBlockchainUseCase } from '../use-cases/register-election-to-blockchain.use-case';

@Injectable()
export class ElectionValidatedListener {
  private readonly logger = new Logger(ElectionValidatedListener.name);

  constructor(private readonly registerElectionUseCase: RegisterElectionToBlockchainUseCase) {}

  @OnEvent('election.validated', { async: true })
  async handle(event: ElectionValidatedEvent): Promise<void> {
    try {
      this.logger.log('[LISTENER] ElectionValidatedListener inicializado');
      await this.registerElectionUseCase.execute(event.electionId);
    } catch (error) {
      this.logger.error(
        `Error procesando la elección ${event.electionId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
