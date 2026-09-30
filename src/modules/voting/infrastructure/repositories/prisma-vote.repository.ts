import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import type {
  RecordVoteInput,
  RecordVoteResult,
  VoteRepository,
} from '../../domain/repositories/vote.repository.interface';

@Injectable()
export class PrismaVoteRepository implements VoteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recordVote(input: RecordVoteInput): Promise<RecordVoteResult> {
    try {
      return await this.runRecordVote(input);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        // Result create race with a concurrent caller: another transaction created the
        // Result row first. The whole transaction (including the roll claim) rolled
        // back, so retry once — the claim re-runs cleanly and the upsert's update
        // branch (atomic increment) runs against the now-existing row.
        return await this.runRecordVote(input);
      }
      throw error;
    }
  }

  private async runRecordVote(input: RecordVoteInput): Promise<RecordVoteResult> {
    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.electoralRoll.updateMany({
        where: {
          election_id: input.electionId,
          elector_id: input.electorId,
          has_voted: false,
        },
        data: {
          has_voted: true,
          vote_attempts: { increment: 1 },
          last_vote_attempt: input.now,
          last_vote_candidacy_id: input.candidacyId,
          last_vote_idempotency_key: input.idempotencyKey,
          last_vote_registered_at: input.now,
        },
      });

      if (claim.count === 0) {
        return { outcome: 'already_voted' };
      }

      if (input.candidacyId !== 'blank') {
        await tx.result.upsert({
          where: {
            election_id_candidacy_id: {
              election_id: input.electionId,
              candidacy_id: input.candidacyId,
            },
          },
          create: {
            election_id: input.electionId,
            candidacy_id: input.candidacyId,
            votes: 1,
          },
          update: {
            votes: { increment: 1 },
            updated_at: new Date(),
          },
        });
      }

      return { outcome: 'recorded' };
    });
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
