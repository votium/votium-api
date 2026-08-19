import { CandidateEntity } from '../../domain/entities/candidate.entity';
import { CandidateResponseDto } from '../dtos/candidate-response.dto';

export class CandidatePresenter {
  static toResponse(entity: CandidateEntity): CandidateResponseDto {
    return new CandidateResponseDto({
      id: entity.id as string,
      firstName: entity.firstName,
      lastName: entity.lastName,
      studentCode: entity.studentCode,
      programCode: entity.programCode,
      identificationNumber: entity.identificationNumber,
      status: entity.status,
      createdAt: entity.createdAt?.toISOString() ?? '',
    });
  }
}
