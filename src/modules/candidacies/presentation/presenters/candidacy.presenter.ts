import { CandidacyEntity } from '../../domain/entities/candidacy.entity';
import type { CandidacyWithCandidate } from '../../domain/repositories/candidacy.repository.interface';
import { PaginatedResponseDto } from 'src/shared/pagination/paginated-response.dto';
import { CandidacyResponseDto } from '../dtos/candidacy-response.dto';
import {
  CandidateBriefResponseDto,
  CandidacyWithCandidateResponseDto,
} from '../dtos/election-candidacies-response.dto';

export class CandidacyPresenter {
  static toResponse(entity: CandidacyEntity): CandidacyResponseDto {
    return new CandidacyResponseDto({
      id: entity.id as string,
      electionId: entity.electionId,
      candidateId: entity.candidateId,
      positionNumber: entity.positionNumber,
      imageUrl: entity.imageUrl,
      createdAt: entity.createdAt?.toISOString() ?? '',
    });
  }

  static toCandidacyWithCandidate(
    candidacy: CandidacyWithCandidate,
  ): CandidacyWithCandidateResponseDto {
    return new CandidacyWithCandidateResponseDto({
      id: candidacy.id,
      positionNumber: candidacy.positionNumber,
      imageUrl: candidacy.imageUrl,
      createdAt: candidacy.createdAt.toISOString(),
      candidate: new CandidateBriefResponseDto({
        id: candidacy.candidateId,
        firstName: candidacy.candidateFirstName,
        lastName: candidacy.candidateLastName,
      }),
    });
  }

  static toElectionCandidaciesList(
    result: { candidacies: CandidacyWithCandidate[]; total: number },
    page: number,
    limit: number,
  ): PaginatedResponseDto<CandidacyWithCandidateResponseDto> {
    return new PaginatedResponseDto({
      data: result.candidacies.map((candidacy) =>
        CandidacyPresenter.toCandidacyWithCandidate(candidacy),
      ),
      total: result.total,
      page,
      limit,
    });
  }
}
