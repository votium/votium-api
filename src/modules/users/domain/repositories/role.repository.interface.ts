import { RoleEntity } from '../entities/role.entity';
import { RoleName } from '../value-objects/role-name.vo';

export interface RoleRepository {
  findByName(name: RoleName): Promise<RoleEntity | null>;
  ensureExists(name: RoleName): Promise<RoleEntity>;
}
