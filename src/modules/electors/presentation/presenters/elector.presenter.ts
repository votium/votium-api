import { ElectorEntity } from '../../domain/entities/elector.entity';
import { MeElectorResponseDto } from '../dtos/me-elector-response.dto';
import { ElectorResponseDto } from '../dtos/elector-response.dto';

export class ElectorPresenter {
  static toResponse(entity: ElectorEntity): ElectorResponseDto {
    return new ElectorResponseDto({
      id: entity.id as string,
      firstName: entity.firstName,
      lastName: entity.lastName,
      email: entity.email,
      studentCode: entity.studentCode,
      programCode: entity.programCode,
      status: entity.status,
      createdAt: entity.createdAt?.toISOString() ?? '',
    });
  }

  static toMeResponse(entity: ElectorEntity): MeElectorResponseDto {
    return new MeElectorResponseDto({
      user: {
        id: entity.id as string,
        role: 'ELECTOR',
        name: `${entity.firstName} ${entity.lastName}`.trim(),
        email: entity.email,
      },
    });
  }

  static toList(entities: ElectorEntity[]): ElectorResponseDto[] {
    return entities.map((entity) => ElectorPresenter.toResponse(entity));
  }
}
