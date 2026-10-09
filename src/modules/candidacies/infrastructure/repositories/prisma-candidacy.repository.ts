import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../../generated/prisma/client';
import { CandidateEntity } from 'src/modules/candidates/domain/entities/candidate.entity';
import { PrismaService } from 'src/shared/database/prisma.service';
import type { CandidacyEntity, UpdateCandidacyInput } from '../../domain/entities/candidacy.entity';
import { CandidacyDuplicateError } from '../../domain/errors/candidacy-duplicate.error';
import type {
  CandidacyListParams,
  CandidacyPageParams,
  CandidacyPageResult,
  CandidacyRepository,
  CandidacyWithCandidate,
  CandidacyWithElection,
} from '../../domain/repositories/candidacy.repository.interface';
import { PrismaCandidacyMapper } from '../mappers/prisma-candidacy.mapper';

type CandidacyWithCandidateRow = {
  id: string;
  election_id: string;
  candidate_id: string;
  position_number: number;
  image_url: string | null;
  created_at: Date;
  candidate: { id: string; first_name: string; last_name: string };
};

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
      where: buildListWhere(electionId, candidateName),
      include: CANDIDATE_SELECT,
      orderBy: { position_number: 'asc' },
    });

    return rows.map(toCandidacyWithCandidate);
  }

  async findPaginatedByElection(
    electionId: string,
    params: CandidacyPageParams,
  ): Promise<CandidacyPageResult> {
    const skip = (params.page - 1) * params.limit;
    const candidateName = params.candidateName?.trim();
    const where = buildListWhere(electionId, candidateName);

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.candiday.count({ where }),
      this.prisma.candiday.findMany({
        where,
        include: CANDIDATE_SELECT,
        orderBy: { position_number: 'asc' },
        skip,
        take: params.limit,
      }),
    ]);

    return { candidacies: rows.map(toCandidacyWithCandidate), total };
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

  async findByCandidate(candidateId: string): Promise<CandidacyWithElection[]> {
    const rows = await this.prisma.candiday.findMany({
      where: {
        candidate_id: candidateId,
      },
      include: {
        election: {
          select: {
            id: true,
            name: true,
            current_status: true,
            start_date: true,
            start_time: true,
            end_date: true,
            end_time: true,
          },
        },
      },
      orderBy: {
        election: {
          start_date: 'desc',
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      electionId: row.election_id,
      candidateId: row.candidate_id,
      electionName: row.election.name,
      electionStatus: row.election.current_status,
      electionStartDate: row.election.start_date,
      electionStartTime: row.election.start_time,
      electionEndDate: row.election.end_date,
      electionEndTime: row.election.end_time,
      createdAt: row.created_at,
    }));
  }
}

function buildListWhere(electionId: string, candidateName?: string): Prisma.CandidayWhereInput {
  return {
    election_id: electionId,
    candidate: {
      deleted_at: null,
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
  };
}

const CANDIDATE_SELECT: Prisma.CandidayInclude = {
  candidate: { select: { id: true, first_name: true, last_name: true } },
};

function toCandidacyWithCandidate(row: CandidacyWithCandidateRow): CandidacyWithCandidate {
  return {
    id: row.id,
    electionId: row.election_id,
    candidateId: row.candidate_id,
    candidateFirstName: row.candidate.first_name,
    candidateLastName: row.candidate.last_name,
    positionNumber: row.position_number,
    imageUrl: row.image_url,
    createdAt: row.created_at,
  };
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
