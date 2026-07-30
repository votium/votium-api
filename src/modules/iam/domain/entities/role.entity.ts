import { RoleName } from '../value-objects/role-name.vo';

export class RoleEntity {
  private constructor(
    public readonly id: string,
    public readonly name: RoleName,
  ) {}

  static create(name: RoleName): RoleEntity {
    const id = crypto.randomUUID();
    return new RoleEntity(id, name);
  }

  static restore(id: string, name: RoleName): RoleEntity {
    return new RoleEntity(id, name);
  }
}
