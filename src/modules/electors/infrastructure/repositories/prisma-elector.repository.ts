import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import { ElectorEntity } from '../../domain/entities/elector.entity';
import { ElectorDuplicateError } from '../../domain/errors/elector-duplicate.error';
import {
  ElectorListParams,
  ElectorRepository,
} from '../../domain/repositories/elector.repository.interface';
import { PrismaElectorMapper } from '../mappers/prisma-elector.mapper';

type PrismaElectorWhere = {
  program_code?: string;
  student_code?: string;
  OR?: Array<{
    first_name?: { contains: string; mode: 'insensitive' };
    last_name?: { contains: string; mode: 'insensitive' };
  }>;
};

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

  async findAll(params: ElectorListParams): Promise<{ electors: ElectorEntity[]; total: number }> {
    const page = params.page;
    const limit = params.limit;
    const skip = (page - 1) * limit;

    const where: PrismaElectorWhere = {
      ...(params.programCode?.trim() ? { program_code: params.programCode.trim() } : {}),
      ...(params.studentCode?.trim() ? { student_code: params.studentCode.trim() } : {}),
      ...(params.name?.trim()
        ? {
            OR: [
              { first_name: { contains: params.name.trim(), mode: 'insensitive' } },
              { last_name: { contains: params.name.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.elector.count({ where }),
      this.prisma.elector.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return { electors: rows.map((row) => PrismaElectorMapper.toDomain(row)), total };
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
