import { UserEntity } from '../../domain/entities/user.entity';
import { RoleName } from '../../domain/value-objects/role-name.vo';
import { UserStatus } from '../../domain/value-objects/user-status.vo';

type PrismaUserRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  password_hash: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  role: { id: string; name: string };
};

export class PrismaUserMapper {
  static toDomain(row: PrismaUserRow): UserEntity {
    return UserEntity.restore({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      passwordHash: row.password_hash,
      role: row.role.name as RoleName,
      roleId: row.role.id,
      status: row.status as UserStatus,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  static toPersistence(entity: UserEntity): PrismaUserRow {
    return {
      id: entity.id,
      first_name: entity.firstName,
      last_name: entity.lastName,
      email: entity.email,
      password_hash: entity.passwordHash,
      status: entity.status,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
      role: { id: entity.roleId, name: entity.role },
    };
  }
}
