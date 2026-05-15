import { RoleName } from "../../domain/value-objects/role-name.vo";
import { UserEntity } from "../../domain/entities/user.entity";

export class PrismaUserMapper {
  static toDomain(row: {
    id: string;
    name: string;
    email: string;
    password_hash: string;
    role: { name: string };
  }): UserEntity {
    return new UserEntity(
      row.id,
      row.name,
      row.email,
      row.password_hash,
      row.role.name as RoleName,
    );
  }
}
