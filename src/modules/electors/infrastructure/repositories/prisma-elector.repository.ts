import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import { ElectorEntity } from '../../domain/entities/elector.entity';
import { ElectorDuplicateError } from '../../domain/errors/elector-duplicate.error';
import {
  ElectorSearchParams,
  ElectorSearchResult,
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

  async findByStudentCodeOrEmail(
    studentCodes: string[],
    emails: string[],
  ): Promise<ElectorEntity[]> {
    const rows = await this.prisma.elector.findMany({
      where: {
        OR: [{ student_code: { in: studentCodes } }, { email: { in: emails } }],
      },
    });
    return rows.map((row) => PrismaElectorMapper.toDomain(row));
  }

  async findById(id: string): Promise<ElectorEntity | null> {
    const row = await this.prisma.elector.findUnique({ where: { id } });
    return row ? PrismaElectorMapper.toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<ElectorEntity | null> {
    const row = await this.prisma.elector.findFirst({
      where: { email: { equals: email.trim(), mode: 'insensitive' } },
    });
    return row ? PrismaElectorMapper.toDomain(row) : null;
  }

  async updateStatus(id: string, status: string): Promise<ElectorEntity | null> {
    try {
      const row = await this.prisma.elector.update({
        where: { id },
        data: { status },
      });
      return PrismaElectorMapper.toDomain(row);
    } catch (error) {
      if (isRecordNotFoundError(error)) return null;
      throw error;
    }
  }

  async search(params: ElectorSearchParams): Promise<ElectorSearchResult> {
    const skip = (params.page - 1) * params.limit;

    const programCode = params.programCode?.trim();
    const studentCode = params.studentCode?.trim();
    const name = params.name?.trim();

    const where: PrismaElectorWhere = {
      ...(programCode ? { program_code: programCode } : {}),
      ...(studentCode ? { student_code: studentCode } : {}),
      ...(name
        ? {
            OR: [
              { first_name: { contains: name, mode: 'insensitive' } },
              { last_name: { contains: name, mode: 'insensitive' } },
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
        take: params.limit,
      }),
    ]);

    return { electors: rows.map((row) => PrismaElectorMapper.toDomain(row)), total };
  }

  async findByStudentCodeAndProgramCode(
    pairs: Array<{ studentCode: string; programCode: string }>,
  ): Promise<ElectorEntity[]> {
    if (pairs.length === 0) return [];

    const rows = await this.prisma.elector.findMany({
      where: {
        OR: pairs.map(({ studentCode, programCode }) => ({
          student_code: studentCode,
          program_code: programCode,
        })),
      },
    });

    return rows.map((row) => PrismaElectorMapper.toDomain(row));
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
