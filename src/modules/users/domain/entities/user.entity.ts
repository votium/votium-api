import { RoleName } from "../value-objects/role-name.vo";

export class UserEntity {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly email: string,
    public readonly passwordHash: string,
    public readonly role: RoleName,
  ) {}
}
