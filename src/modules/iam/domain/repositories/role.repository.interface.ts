import { RoleEntity } from '../entities/role.entity';
import { RoleName } from '../value-objects/role-name.vo';

export const ROLE_REPOSITORY = 'ROLE_REPOSITORY';

export interface RoleRepository {
  findById(id: string): Promise<RoleEntity | null>;
  findByName(name: RoleName): Promise<RoleEntity | null>;
  ensureExists(name: RoleName): Promise<RoleEntity>;
}
