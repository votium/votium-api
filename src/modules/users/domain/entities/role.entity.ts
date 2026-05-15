import { RoleName } from "../value-objects/role-name.vo";

export class RoleEntity {
  constructor(
    public readonly id: string,
    public readonly name: RoleName,
  ) {}
}
