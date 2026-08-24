import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import { ElectionEntity } from '../../domain/entities/election.entity';
import { ElectionNameConflictError } from '../../domain/errors/election-name-conflict.error';
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
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
