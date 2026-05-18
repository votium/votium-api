import { RoleEntity } from '../../domain/entities/role.entity';
import { RoleName } from '../../domain/value-objects/role-name.vo';

export class PrismaRoleMapper {
  static toDomain(row: { id: string; name: string }): RoleEntity {
    return new RoleEntity(row.id, row.name as RoleName);
  }
}
