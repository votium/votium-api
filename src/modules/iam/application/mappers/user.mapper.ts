import { UserEntity } from '../../domain/entities/user.entity';
import { UserResponseDto } from '../dtos/user-response.dto';

export class UserMapper {
  static toResponse(entity: UserEntity): UserResponseDto {
    return new UserResponseDto({
      id: entity.id,
      firstName: entity.firstName,
      lastName: entity.lastName,
      email: entity.email,
      role: { id: entity.roleId, name: entity.role },
      status: entity.status,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    });
  }

  static toListItem(entity: UserEntity): UserResponseDto {
    return new UserResponseDto({
      id: entity.id,
      firstName: entity.firstName,
      lastName: entity.lastName,
      email: entity.email,
      role: { id: entity.roleId, name: entity.role },
      status: entity.status,
      createdAt: entity.createdAt.toISOString(),
    });
  }
}
