import { Injectable, Logger, Inject } from '@nestjs/common';

import {
  type VoteCredentialRepository,
  VOTE_CREDENTIAL_REPOSITORY,
} from '../../domain/repositories/vote-credential.repository';
import { VoteProcessingPort } from '../ports/vote-processing.port';
import { MarkVotedBatchResultDto } from '../dtos';

@Injectable()
export class FlushVoteMarksUseCase {
  private readonly log = new Logger(FlushVoteMarksUseCase.name);
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    @Inject(VOTE_CREDENTIAL_REPOSITORY)
    private readonly voteCredentialRepository: VoteCredentialRepository,
    private readonly voteProcessing: VoteProcessingPort,
  ) {}

  execute(electionId?: string): Promise<void> {
    const next = this.queue.then(() => this.run(electionId));
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async run(electionId?: string): Promise<void> {
    const pending = await this.voteCredentialRepository.findReported(electionId);
    const byElection: Map<string, string[]> = new Map();
    for (const p of pending) {
      byElection.set(p.electionId, [...(byElection.get(p.electionId) ?? []), p.voterHash]);
    }

    for (const [eid, hashes] of byElection) {
      shuffle(hashes);
      for (let i = 0; i < hashes.length; i += 500) {
        const batch = hashes.slice(i, i + 500);
        let res: MarkVotedBatchResultDto;
        try {
          res = await this.voteProcessing.markVotedBatch({ electionId: eid, voterHashes: batch });
        } catch (e: any) {
          if (e?.code === 'ELECTION_NOT_ACTIVE') {
            await this.voteCredentialRepository.setMarkStatus(eid, batch, 'REJECTED');
            this.log.warn(`Elección ${eid}: lote descartado, la elección ya no admite marcas`);
            continue;
          }
          this.log.error(`Lote fallido en ${eid}: ${e.code}`);
          continue;
        }
        const rejected = res.data.rejected ?? [];
        const bad: Set<string> = new Set(rejected.map((r) => r.voterHash));
        await this.voteCredentialRepository.setMarkStatus(
          eid,
          batch.filter((h) => !bad.has(h)),
          'MARKED',
        );

        if (rejected.length > 0) {
          await this.voteCredentialRepository.setMarkStatus(eid, [...bad], 'REJECTED');
          this.log.warn(
            `Elección ${eid}: ${rejected.length} rechazados (${[
              ...new Set(rejected.map((r) => r.reason)),
            ].join(', ')})`,
          );
        }
      }
    }
  }
}
function shuffle(hashes: string[]) {
  for (let i = hashes.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [hashes[i], hashes[j]] = [hashes[j], hashes[i]];
  }
}
