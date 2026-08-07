import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import { ElectorEntity } from '../../domain/entities/elector.entity';
import { ElectorDuplicateError } from '../../domain/errors/elector-duplicate.error';
import { ElectorRepository } from '../../domain/repositories/elector.repository.interface';
import { PrismaElectorMapper } from '../mappers/prisma-elector.mapper';

@Injectable()
export class PrismaElectorRepository implements ElectorRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(entity: ElectorEntity): Promise<ElectorEntity> {
    try {
      const row = await this.prisma.elector.create({
        data: PrismaElectorMapper.toPersistence(entity),
      });
      return PrismaElectorMapper.toDomain(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ElectorDuplicateError();
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
