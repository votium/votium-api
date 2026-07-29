import { UserEntity } from '../../domain/entities/user.entity';
import { UserResponseDto } from '../dtos/user-response.dto';

export class UserPresenter {
  static toResponse(entity: UserEntity): UserResponseDto {
    return new UserResponseDto({
      id: entity.id,
      firstName: entity.firstName,
      lastName: entity.lastName,
      email: entity.email,
      role: { id: entity.roleId, name: entity.role.value },
      status: entity.status.value,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    });
  }

  static toList(entities: UserEntity[]): UserResponseDto[] {
    return entities.map((e) => UserPresenter.toResponse(e));
  }
}
