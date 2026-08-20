import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import { CandidateEntity } from '../../domain/entities/candidate.entity';
import { CandidateDuplicateError } from '../../domain/errors/candidate-duplicate.error';
import { CandidateRepository } from '../../domain/repositories/candidate.repository.interface';
import { PrismaCandidateMapper } from '../mappers/prisma-candidate.mapper';

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
