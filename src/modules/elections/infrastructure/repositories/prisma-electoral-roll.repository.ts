import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import { ElectoralRollEntity } from '../../domain/entities/electoral-roll.entity';
import { ElectoralRollRepository } from '../../domain/repositories/electoral-roll.repository.interface';
import { PrismaElectoralRollMapper } from '../mappers/prisma-electoral-roll.mapper';

@Injectable()
export class PrismaElectoralRollRepository implements ElectoralRollRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByElectionAndElectorIds(
    electionId: string,
    electorIds: string[],
  ): Promise<ElectoralRollEntity[]> {
    if (electorIds.length === 0) return [];

    const rows = await this.prisma.electoralRoll.findMany({
      where: {
        election_id: electionId,
        elector_id: { in: electorIds },
      },
    });

    return rows.map((row) => PrismaElectoralRollMapper.toDomain(row));
  }

  async createMany(electionId: string, electorIds: string[]): Promise<number> {
    if (electorIds.length === 0) return 0;

    const result = await this.prisma.electoralRoll.createMany({
      data: electorIds.map((electorId) => ({
        election_id: electionId,
        elector_id: electorId,
      })),
      skipDuplicates: true,
    });

    return result.count;
  }

  async countByElection(electionId: string): Promise<number> {
    return this.prisma.electoralRoll.count({
      where: { election_id: electionId },
    });
  }

  async countByElectionIds(
    electionIds: string[],
  ): Promise<Array<{ electionId: string; total: number }>> {
    if (electionIds.length === 0) return [];

    const rows = await this.prisma.electoralRoll.groupBy({
      by: ['election_id'],
      where: { election_id: { in: electionIds } },
      _count: { _all: true },
    });

    return rows.map((row) => ({ electionId: row.election_id, total: row._count._all }));
  }

  async deleteByElectionAndElectorId(electionId: string, electorId: string): Promise<boolean> {
    const result = await this.prisma.electoralRoll.deleteMany({
      where: {
        election_id: electionId,
        elector_id: electorId,
      },
    });

    return result.count > 0;
  }

  async findHasVoted(electionId: string, electorId: string): Promise<boolean | null> {
    const row = await this.prisma.electoralRoll.findUnique({
      where: { election_id_elector_id: { election_id: electionId, elector_id: electorId } },
      select: { has_voted: true },
    });

    return row ? row.has_voted : null;
  }
}
