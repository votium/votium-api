import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../../generated/prisma/client';
import { PrismaService } from 'src/shared/database/prisma.service';
import { ElectionEntity, type ElectionStatus } from '../../domain/entities/election.entity';
import { ElectionNameConflictError } from '../../domain/errors/election-name-conflict.error';
import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import {
  type ElectionListParams,
  type ElectionListResult,
  type ElectionRepository,
} from '../../domain/repositories/election.repository.interface';
import { PrismaElectionMapper } from '../mappers/prisma-election.mapper';

@Injectable()
export class PrismaElectionRepository implements ElectionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: ElectionListParams): Promise<ElectionListResult> {
    const skip = (params.page - 1) * params.limit;
    const name = params.name?.trim();

    const where: Prisma.ElectionWhereInput = {
      ...(name ? { name: { contains: name, mode: 'insensitive' } } : {}),
      ...(params.status ? { current_status: params.status } : {}),
      ...(params.startDate ? { start_date: { gte: params.startDate } } : {}),
      ...(params.endDate ? { end_date: { lte: params.endDate } } : {}),
      ...(params.active !== undefined ? buildActiveFilter(params.active, params.now) : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.election.count({ where }),
      this.prisma.election.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: params.limit,
      }),
    ]);

    return { elections: rows.map((row) => PrismaElectionMapper.toDomain(row)), total };
  }

  async create(entity: ElectionEntity): Promise<ElectionEntity> {
    try {
      const row = await this.prisma.election.create({
        data: PrismaElectionMapper.toPersistence(entity),
      });
      return PrismaElectionMapper.toDomain(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ElectionNameConflictError();
      }
      throw error;
    }
  }

  async findById(id: string): Promise<ElectionEntity | null> {
    const row = await this.prisma.election.findUnique({ where: { id } });
    return row ? PrismaElectionMapper.toDomain(row) : null;
  }

  async update(entity: ElectionEntity): Promise<ElectionEntity> {
    try {
      const row = await this.prisma.election.update({
        where: { id: entity.id as string },
        data: PrismaElectionMapper.toUpdateData(entity),
      });
      return PrismaElectionMapper.toDomain(row);
    } catch (error) {
      if (isRecordNotFoundError(error)) throw new ElectionNotFoundError(entity.id as string);
      if (isUniqueConstraintError(error)) throw new ElectionNameConflictError();
      throw error;
    }
  }

  async updateStatus(
    id: string,
    status: ElectionStatus,
    requestingUserId: string,
  ): Promise<ElectionEntity | null> {
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const current = await tx.election.findUnique({ where: { id } });
        if (!current) {
          return null;
        }

        const updated = await tx.election.update({
          where: { id },
          data: { current_status: status },
        });

        // Record the transition. old_status is read from the row captured before the
        // update so the history entry always reflects the actual previous state.
        await tx.electionStatusHistory.create({
          data: {
            election_id: id,
            user_id: requestingUserId,
            old_status: current.current_status,
            new_status: status,
          },
        });

        return updated;
      });

      return row ? PrismaElectionMapper.toDomain(row) : null;
    } catch (error) {
      // The row can disappear between the read and the update (concurrent delete);
      // that P2025 must surface as null just like a plain missing election.
      if (isRecordNotFoundError(error)) return null;
      throw error;
    }
  }

  async hasCandidates(electionId: string): Promise<boolean> {
    const count = await this.prisma.candiday.count({
      where: { election_id: electionId },
    });
    return count > 0;
  }

  async hasVotes(electionId: string): Promise<boolean> {
    const count = await this.prisma.voteMetadata.count({
      where: { election_id: electionId },
    });
    return count > 0;
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // Remove any child rows that may exist, in FK-safe order, before removing the
        // election. Candidates/votes are guaranteed absent by the use-case guards, but
        // the remaining related rows (status history, electoral rolls, notifications,
        // reports, etc.) are removed here so no orphaned records remain.
        await tx.electionStatusHistory.deleteMany({ where: { election_id: id } });
        await tx.notification.deleteMany({ where: { election_id: id } });
        await tx.report.deleteMany({ where: { election_id: id } });
        await tx.certificate.deleteMany({ where: { election: { id } } });
        await tx.electoralRoll.deleteMany({ where: { election_id: id } });
        await tx.result.deleteMany({ where: { election_id: id } });
        await tx.voteMetadata.deleteMany({ where: { election_id: id } });
        await tx.candiday.deleteMany({ where: { election_id: id } });
        await tx.election.delete({ where: { id } });
      });
    } catch (error) {
      if (isRecordNotFoundError(error)) throw new ElectionNotFoundError(id);
      throw error;
    }
  }
}

function isRecordNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2025'
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

// Schedule-based "active" window (UTC): start_instant <= now <= end_instant.
// start_instant = start_date + start_time, end_instant = end_date + end_time.
// Because DATE and TIME are separate columns, the window is expressed as:
//   started   = start_date < today OR (start_date = today AND start_time <= nowTime)
//   notEnded  = end_date > today   OR (end_date = today   AND end_time >= nowTime)
//   active    = started AND notEnded
// `now` is the reference instant; defaults to the current time (UTC).
function buildActiveFilter(active: boolean, now: Date = new Date()): Prisma.ElectionWhereInput {
  const today = currentElectionDate(now);
  const nowTime = currentElectionTime(now);

  const started: Prisma.ElectionWhereInput = {
    OR: [
      { start_date: { lt: today } },
      { AND: [{ start_date: today }, { start_time: { lte: nowTime } }] },
    ],
  };
  const notEnded: Prisma.ElectionWhereInput = {
    OR: [
      { end_date: { gt: today } },
      { AND: [{ end_date: today }, { end_time: { gte: nowTime } }] },
    ],
  };
  const activeWhere: Prisma.ElectionWhereInput = { AND: [started, notEnded] };

  return active ? activeWhere : { NOT: activeWhere };
}

function currentElectionDate(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function currentElectionTime(now: Date = new Date()): Date {
  return new Date(
    Date.UTC(1970, 0, 1, now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds()),
  );
}
