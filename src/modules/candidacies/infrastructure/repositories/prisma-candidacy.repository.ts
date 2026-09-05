import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import { CandidacyEntity } from '../../domain/entities/candidacy.entity';
import { CandidacyDuplicateError } from '../../domain/errors/candidacy-duplicate.error';
import type { CandidacyRepository } from '../../domain/repositories/candidacy.repository.interface';
import { PrismaCandidacyMapper } from '../mappers/prisma-candidacy.mapper';

@Injectable()
export class PrismaCandidacyRepository implements CandidacyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMaxPosition(electionId: string): Promise<number> {
    const result = await this.prisma.candiday.aggregate({
      where: { election_id: electionId },
      _max: { position_number: true },
    });
    return result._max?.position_number ?? 0;
  }

  async create(entity: CandidacyEntity): Promise<CandidacyEntity> {
    try {
      const row = await this.prisma.candiday.create({
        data: PrismaCandidacyMapper.toPersistence(entity),
      });
      return PrismaCandidacyMapper.toDomain(row);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new CandidacyDuplicateError();
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
