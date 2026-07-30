import { RoleEntity } from '../../domain/entities/role.entity';
import { RoleName } from '../../domain/value-objects/role-name.vo';

export class PrismaRoleMapper {
  static toDomain(row: { id: string; name: string }): RoleEntity {
    return RoleEntity.restore(row.id, RoleName.from(row.name));
  }

  static toPersistence(entity: RoleEntity): { id: string; name: string } {
    return { id: entity.id, name: entity.name.value };
  }
}
