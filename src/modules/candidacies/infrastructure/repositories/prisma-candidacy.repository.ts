import { Injectable } from '@nestjs/common';
import { CandidateEntity } from 'src/modules/candidates/domain/entities/candidate.entity';
import { PrismaService } from 'src/shared/database/prisma.service';
import type { CandidacyEntity, UpdateCandidacyInput } from '../../domain/entities/candidacy.entity';
import { CandidacyDuplicateError } from '../../domain/errors/candidacy-duplicate.error';
import type {
  CandidacyListParams,
  CandidacyRepository,
  CandidacyWithCandidate,
} from '../../domain/repositories/candidacy.repository.interface';
import { PrismaCandidacyMapper } from '../mappers/prisma-candidacy.mapper';

@Injectable()
export class PrismaCandidacyRepository implements CandidacyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUsedPositions(electionId: string): Promise<number[]> {
    const rows = await this.prisma.candiday.findMany({
      where: { election_id: electionId },
      select: { position_number: true },
      orderBy: { position_number: 'asc' },
    });
    return rows.map((row) => row.position_number);
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

  async findByElection(
    electionId: string,
    params?: CandidacyListParams,
  ): Promise<CandidacyWithCandidate[]> {
    const candidateName = params?.candidateName?.trim();

    const rows = await this.prisma.candiday.findMany({
      where: {
        election_id: electionId,
        candidate: {
          status: { not: CandidateEntity.INACTIVE_STATUS },
          ...(candidateName
            ? {
                OR: [
                  { first_name: { contains: candidateName, mode: 'insensitive' } },
                  { last_name: { contains: candidateName, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
      },
      include: {
        candidate: { select: { id: true, first_name: true, last_name: true } },
      },
      orderBy: { position_number: 'asc' },
    });

    return rows.map((row) => ({
      id: row.id,
      electionId: row.election_id,
      candidateId: row.candidate_id,
      candidateFirstName: row.candidate.first_name,
      candidateLastName: row.candidate.last_name,
      positionNumber: row.position_number,
      imageUrl: row.image_url,
      createdAt: row.created_at,
    }));
  }

  async findById(id: string): Promise<CandidacyEntity | null> {
    const row = await this.prisma.candiday.findUnique({ where: { id } });
    return row ? PrismaCandidacyMapper.toDomain(row) : null;
  }

  async update(id: string, input: UpdateCandidacyInput): Promise<CandidacyEntity | null> {
    try {
      const row = await this.prisma.candiday.update({
        where: { id },
        data: PrismaCandidacyMapper.toUpdateData(input),
      });
      return PrismaCandidacyMapper.toDomain(row);
    } catch (error) {
      if (isRecordNotFoundError(error)) return null;
      if (isUniqueConstraintError(error)) throw new CandidacyDuplicateError();
      throw error;
    }
  }

  async deleteByElectionAndCandidacyId(electionId: string, candidacyId: string): Promise<boolean> {
    const result = await this.prisma.candiday.deleteMany({
      where: { id: candidacyId, election_id: electionId },
    });
    return result.count > 0;
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
