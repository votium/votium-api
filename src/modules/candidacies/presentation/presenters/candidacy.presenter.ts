import { CandidacyEntity } from '../../domain/entities/candidacy.entity';
import { CandidacyResponseDto } from '../dtos/candidacy-response.dto';

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
}
