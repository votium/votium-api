import { UserEntity } from '../../domain/entities/user.entity';
import { RoleName } from '../../domain/value-objects/role-name.vo';
import { UserStatus } from '../../domain/value-objects/user-status.vo';

export class PrismaUserMapper {
  static toDomain(row: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    password_hash: string;
    status: string;
    created_at: Date;
    updated_at: Date;
    role: { id: string; name: string };
  }): UserEntity {
    return new UserEntity(
      row.id,
      row.first_name,
      row.last_name,
      row.email,
      row.password_hash,
      row.role.name as RoleName,
      row.role.id,
      row.status as UserStatus,
      row.created_at,
      row.updated_at,
    );
  }
}
