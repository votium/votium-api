import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FlushVoteMarksUseCase } from '../../application/use-cases/flush-vote-marks.use-case';

@Injectable()
export class VoteMarksJob {
  private readonly log = new Logger(VoteMarksJob.name);

  constructor(private readonly flush: FlushVoteMarksUseCase) {}

  @Cron(CronExpression.EVERY_10_MINUTES, { name: 'flush-vote-marks' })
  async run() {
    if (process.env.VOTE_MARKS_CRON === 'off') return;
    try {
      await this.flush.execute();
    } catch (e: any) {
      this.log.error(`Fallo inesperado en el flush: ${e?.message ?? e}`);
    }
  }
}
