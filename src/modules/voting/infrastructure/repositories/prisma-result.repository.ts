import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import type { ResultRepository } from '../../domain/repositories/result.repository.interface';

@Injectable()
export class PrismaResultRepository implements ResultRepository {
  constructor(private readonly prisma: PrismaService) {}

  async incrementVotes(electionId: string, candidacyId: string): Promise<void> {
    const upsert = () =>
      this.prisma.result.upsert({
        where: {
          election_id_candidacy_id: {
            election_id: electionId,
            candidacy_id: candidacyId,
          },
        },
        create: {
          election_id: electionId,
          candidacy_id: candidacyId,
          votes: 1,
        },
        update: {
          votes: { increment: 1 },
          updated_at: new Date(),
        },
      });

    try {
      await upsert();
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        // Concurrent create race: another caller created the row first. Retry once
        // so the update branch (atomic increment) runs against the now-existing row.
        await upsert();
        return;
      }
      throw error;
    }
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
