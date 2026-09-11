import { CandidacyEntity } from '../../domain/entities/candidacy.entity';
import type { CandidacyWithCandidate } from '../../domain/repositories/candidacy.repository.interface';
import { CandidacyResponseDto } from '../dtos/candidacy-response.dto';
import {
  CandidateBriefResponseDto,
  CandidacyWithCandidateResponseDto,
  ElectionCandidaciesResponseDto,
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

  static toElectionCandidacies(result: {
    electionName: string;
    candidacies: CandidacyWithCandidate[];
  }): ElectionCandidaciesResponseDto {
    return new ElectionCandidaciesResponseDto({
      electionName: result.electionName,
      candidacies: result.candidacies.map(
        (candidacy) =>
          new CandidacyWithCandidateResponseDto({
            id: candidacy.id,
            positionNumber: candidacy.positionNumber,
            imageUrl: candidacy.imageUrl,
            createdAt: candidacy.createdAt.toISOString(),
            candidate: new CandidateBriefResponseDto({
              id: candidacy.candidateId,
              firstName: candidacy.candidateFirstName,
              lastName: candidacy.candidateLastName,
            }),
          }),
      ),
    });
  }
}
