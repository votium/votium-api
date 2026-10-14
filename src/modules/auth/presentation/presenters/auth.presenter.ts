import { ElectorEntity } from 'src/modules/electors/domain/entities/elector.entity';
import { UserEntity } from 'src/modules/iam/domain/entities/user.entity';
import { MeElectorResponseDto } from '../../application/dtos/me-elector-response.dto';
import { MeUserResponseDto } from '../../application/dtos/me-user-response.dto';

export class AuthPresenter {
  static toMeUserResponse(entity: UserEntity): MeUserResponseDto {
    return new MeUserResponseDto({
      user: {
        id: entity.id,
        role: entity.role.value,
        name: `${entity.firstName} ${entity.lastName}`.trim(),
        email: entity.email,
      },
    });
  }

  static toMeElectorResponse(entity: ElectorEntity): MeElectorResponseDto {
    return new MeElectorResponseDto({
      user: {
        id: entity.id as string,
        role: 'ELECTOR',
        name: `${entity.firstName} ${entity.lastName}`.trim(),
        email: entity.email,
      },
    });
  }
}
