import { ElectorEntity } from '../../domain/entities/elector.entity';
import { ElectorResponseDto } from '../dtos/elector-response.dto';

export class ElectorPresenter {
  static toSearchResponse(entity: ElectorEntity): ElectorResponseDto {
    return new ElectorResponseDto({
      id: entity.id!,
      firstName: entity.firstName,
      lastName: entity.lastName,
      email: entity.email,
      studentCode: entity.studentCode,
      programCode: entity.programCode,
      status: entity.status,
      createdAt: entity.createdAt!.toISOString(),
    });
  }

  static toSearchList(entities: ElectorEntity[]): ElectorResponseDto[] {
    return entities.map((entity) => ElectorPresenter.toSearchResponse(entity));
  }
}
