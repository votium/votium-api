import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { envs } from 'src/config';
import type { CloseExpiredElectionsUseCase } from '../../application/use-cases/close-expired-elections.use-case';

// Background adapter that triggers automatic election closure on a fixed UTC
// schedule. Not an HTTP endpoint — the use case can also be invoked directly
// (e.g. by e2e tests) through DI.
@Injectable()
export class ElectionClosureSchedulerService {
  private readonly logger = new Logger(ElectionClosureSchedulerService.name);

  constructor(private readonly closeExpiredElections: CloseExpiredElectionsUseCase) {}

  // Every minute in UTC; waitForCompletion skips ticks while a run is in progress
  // (no overlapping runs). Operational opt-out via ELECTION_AUTO_CLOSE_ENABLED.
  @Cron(CronExpression.EVERY_MINUTE, { timeZone: 'UTC', waitForCompletion: true })
  async handleTick(): Promise<void> {
    if (!envs.electionAutoCloseEnabled) return;

    try {
      const result = await this.closeExpiredElections.execute();
      this.logger.log(
        `Election auto-close: evaluated=${result.evaluated} eligible=${result.eligible} ` +
          `closed=${result.closed} alreadyClosed=${result.alreadyClosed} failed=${result.failed.length}`,
      );
      for (const failure of result.failed) {
        this.logger.error(
          `Failed to auto-close election ${failure.electionId}`,
          failure.error instanceof Error ? failure.error.stack : String(failure.error),
        );
      }
    } catch (error) {
      // Run-level failure (e.g. the expired query itself failed): log it so the
      // execution error is observable instead of becoming an unhandled rejection.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Election auto-close run failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
