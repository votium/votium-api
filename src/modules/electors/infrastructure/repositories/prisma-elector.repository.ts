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
