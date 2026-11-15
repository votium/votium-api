import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import { ElectoralRollEntity } from '../../domain/entities/electoral-roll.entity';
import type {
  ActiveParticipationCounts,
  ElectionParticipationCount,
  ElectoralRollRepository,
} from '../../domain/repositories/electoral-roll.repository.interface';
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

  async findByElectionId(electionId: string): Promise<ElectoralRollEntity[]> {
    const rows = await this.prisma.electoralRoll.findMany({
      where: { election_id: electionId },
    });

    return rows.map((row) => PrismaElectoralRollMapper.toDomain(row));
  }

  async findHasVoted(electionId: string, electorId: string): Promise<boolean | null> {
    const row = await this.prisma.electoralRoll.findUnique({
      where: { election_id_elector_id: { election_id: electionId, elector_id: electorId } },
      select: { has_voted: true },
    });

    return row ? row.has_voted : null;
  }

  async countVotedByElectionIds(electionIds: string[]): Promise<ElectionParticipationCount[]> {
    if (electionIds.length === 0) return [];

    const rows = await this.prisma.electoralRoll.groupBy({
      by: ['election_id'],
      where: { election_id: { in: electionIds }, has_voted: true },
      _count: { _all: true },
    });

    return rows.map((row) => ({ electionId: row.election_id, total: row._count._all }));
  }

  async countActiveParticipationByElector(electorId: string): Promise<ActiveParticipationCounts> {
    // Single grouped query so both counts come from the same snapshot.
    const rows = await this.prisma.electoralRoll.groupBy({
      by: ['has_voted'],
      where: { elector_id: electorId, election: { is: { current_status: 'ACTIVE' } } },
      _count: { _all: true },
    });

    return {
      activeElections: rows.reduce((sum, row) => sum + row._count._all, 0),
      participatedElections: rows.find((row) => row.has_voted)?._count._all ?? 0,
    };
  }
}
