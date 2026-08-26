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
