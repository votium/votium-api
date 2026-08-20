import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import { CandidateEntity } from '../../domain/entities/candidate.entity';
import { CandidateDuplicateError } from '../../domain/errors/candidate-duplicate.error';
import {
  CandidateSearchParams,
  CandidateRepository,
} from '../../domain/repositories/candidate.repository.interface';
import { PrismaCandidateMapper } from '../mappers/prisma-candidate.mapper';

type PrismaCandidateWhere = {
  first_name?: { contains: string; mode: 'insensitive' };
  last_name?: { contains: string; mode: 'insensitive' };
  program_code?: string;
  student_code?: string;
  identification_number?: string;
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

  async search(params: CandidateSearchParams): Promise<CandidateEntity[]> {
    const firstName = params.firstName?.trim();
    const lastName = params.lastName?.trim();
    const studyPlanCode = params.studyPlanCode?.trim();
    const studentCode = params.studentCode?.trim();
    const identificationNumber = params.identificationNumber?.trim();

    const where: PrismaCandidateWhere = {
      ...(firstName ? { first_name: { contains: firstName, mode: 'insensitive' } } : {}),
      ...(lastName ? { last_name: { contains: lastName, mode: 'insensitive' } } : {}),
      ...(studyPlanCode ? { program_code: studyPlanCode } : {}),
      ...(studentCode ? { student_code: studentCode } : {}),
      ...(identificationNumber ? { identification_number: identificationNumber } : {}),
    };

    const rows = await this.prisma.candidate.findMany({
      where,
      orderBy: { created_at: 'desc' },
    });
    return rows.map((row) => PrismaCandidateMapper.toDomain(row));
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
