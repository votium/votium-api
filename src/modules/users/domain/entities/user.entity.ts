import { RoleName } from '../value-objects/role-name.vo';
import { UserStatus } from '../value-objects/user-status.vo';

export class UserEntity {
  constructor(
    public readonly id: string,
    public readonly firstName: string,
    public readonly lastName: string,
    public readonly email: string,
    public readonly passwordHash: string,
    public readonly role: RoleName,
    public readonly roleId: string,
    public readonly status: UserStatus,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  isDisabled(): boolean {
    return this.status === UserStatus.DISABLED;
  }
}
