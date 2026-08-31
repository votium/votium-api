import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import { ElectionEntity } from '../../domain/entities/election.entity';
import { ElectionNameConflictError } from '../../domain/errors/election-name-conflict.error';
import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import { type ElectionRepository } from '../../domain/repositories/election.repository.interface';
import { PrismaElectionMapper } from '../mappers/prisma-election.mapper';

@Injectable()
export class PrismaElectionRepository implements ElectionRepository {
  constructor(private readonly prisma: PrismaService) {}

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
