import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import { CandidateEntity } from '../../domain/entities/candidate.entity';
import type { UpdateCandidateInput } from '../../domain/entities/update-candidate-input';
import { CandidateDuplicateError } from '../../domain/errors/candidate-duplicate.error';
import {
  CandidateSearchParams,
  CandidateSearchResult,
  CandidateRepository,
} from '../../domain/repositories/candidate.repository.interface';
import { PrismaCandidateMapper } from '../mappers/prisma-candidate.mapper';

type PrismaCandidateWhere = {
  status?: { not: string };
  first_name?: { contains: string; mode: 'insensitive' };
  last_name?: { contains: string; mode: 'insensitive' };
  program_code?: string;
  student_code?: string;
  identification_number?: string;
  OR?: Array<{
    first_name?: { contains: string; mode: 'insensitive' };
    last_name?: { contains: string; mode: 'insensitive' };
  }>;
};

@Injectable()
export class PrismaCandidateRepository implements CandidateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(entity: CandidateEntity): Promise<CandidateEntity> {
    try {
      const row = await this.prisma.candidate.create({
        data: PrismaCandidateMapper.toPersistence(entity),
      });
      return PrismaCandidateMapper.toDomain(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new CandidateDuplicateError();
      }
      throw error;
    }
  }

  async findById(id: string): Promise<CandidateEntity | null> {
    const row = await this.prisma.candidate.findUnique({ where: { id } });
    return row ? PrismaCandidateMapper.toDomain(row) : null;
  }

  async updateStatus(id: string, status: string): Promise<CandidateEntity | null> {
    try {
      const row = await this.prisma.candidate.update({
        where: { id },
        data: { status },
      });
      return PrismaCandidateMapper.toDomain(row);
    } catch (error) {
      if (isRecordNotFoundError(error)) return null;
      throw error;
    }
  }

  async update(id: string, input: UpdateCandidateInput): Promise<CandidateEntity | null> {
    try {
      const data = PrismaCandidateMapper.toUpdateData(input);
      if (Object.keys(data).length === 0) {
        return this.findById(id);
      }
      const row = await this.prisma.candidate.update({
        where: { id },
        data,
      });
      return PrismaCandidateMapper.toDomain(row);
    } catch (error) {
      if (isRecordNotFoundError(error)) return null;
      if (isUniqueConstraintError(error)) throw new CandidateDuplicateError();
      throw error;
    }
  }

  async search(params: CandidateSearchParams): Promise<CandidateSearchResult> {
    const skip = (params.page - 1) * params.limit;
    const firstName = params.firstName?.trim();
    const lastName = params.lastName?.trim();
    const name = params.name?.trim();
    const studyPlanCode = params.studyPlanCode?.trim();
    const studentCode = params.studentCode?.trim();
    const identificationNumber = params.identificationNumber?.trim();

    const where: PrismaCandidateWhere = {
      ...(params.includeInactive ? {} : { status: { not: CandidateEntity.INACTIVE_STATUS } }),
      ...(firstName ? { first_name: { contains: firstName, mode: 'insensitive' } } : {}),
      ...(lastName ? { last_name: { contains: lastName, mode: 'insensitive' } } : {}),
      ...(name
        ? {
            OR: [
              { first_name: { contains: name, mode: 'insensitive' } },
              { last_name: { contains: name, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(studyPlanCode ? { program_code: studyPlanCode } : {}),
      ...(studentCode ? { student_code: studentCode } : {}),
      ...(identificationNumber ? { identification_number: identificationNumber } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.candidate.count({ where }),
      this.prisma.candidate.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take: params.limit,
      }),
    ]);
    return { candidates: rows.map((row) => PrismaCandidateMapper.toDomain(row)), total };
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
