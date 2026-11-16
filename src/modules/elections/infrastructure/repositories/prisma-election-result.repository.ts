import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import type {
  ElectionResultCandidacyRef,
  ElectionResultRepository,
  ElectionResultVoteCount,
} from '../../domain/repositories/election-result.repository.interface';

@Injectable()
export class PrismaElectionResultRepository implements ElectionResultRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCandidacyRefsByElection(electionId: string): Promise<ElectionResultCandidacyRef[]> {
    // No candidate status filter: votes already cast still count after deactivation.
    const rows = await this.prisma.candiday.findMany({
      where: { election_id: electionId },
      select: { id: true, candidate_id: true },
      orderBy: { position_number: 'asc' },
    });
    return rows.map((row) => ({ id: row.id, candidateId: row.candidate_id }));
  }

  async synchronize(electionId: string, rows: ElectionResultVoteCount[]): Promise<number> {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        await tx.result.upsert({
          where: {
            election_id_candidacy_id: { election_id: electionId, candidacy_id: row.candidacyId },
          },
          create: {
            election_id: electionId,
            candidacy_id: row.candidacyId,
            votes: row.votes,
            updated_at: now,
          },
          update: { votes: row.votes, updated_at: now },
        });
      }

      // Rows outside the synchronized set are kept (no delete) but zeroed.
      await tx.result.updateMany({
        where: {
          election_id: electionId,
          ...(rows.length > 0
            ? { candidacy_id: { notIn: rows.map((row) => row.candidacyId) } }
            : {}),
        },
        data: { votes: 0, updated_at: now },
      });
    });

    return rows.length;
  }
}
