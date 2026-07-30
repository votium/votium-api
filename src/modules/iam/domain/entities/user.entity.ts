import { RoleName } from '../value-objects/role-name.vo';
import { UserStatus } from '../value-objects/user-status.vo';
import { UserAlreadyDisabledError } from '../errors/user-already-disabled.error';

export interface CreateUserInput {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  role: RoleName;
  roleId: string;
  status?: UserStatus;
}

export interface RestoreUserInput {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  role: RoleName;
  roleId: string;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class UserEntity {
  private constructor(
    public readonly id: string,
    public readonly firstName: string,
    public readonly lastName: string,
    public readonly email: string,
    public readonly passwordHash: string,
    public readonly role: RoleName,
    public readonly roleId: string,
    private _status: UserStatus,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static create(input: CreateUserInput): UserEntity {
    const id = crypto.randomUUID();
    const now = new Date();

    return new UserEntity(
      id,
      input.firstName,
      input.lastName,
      input.email.trim().toLowerCase(),
      input.passwordHash,
      input.role,
      input.roleId,
      input.status ?? UserStatus.ACTIVE,
      now,
      now,
    );
  }

  static restore(input: RestoreUserInput): UserEntity {
    return new UserEntity(
      input.id,
      input.firstName,
      input.lastName,
      input.email,
      input.passwordHash,
      input.role,
      input.roleId,
      input.status,
      input.createdAt,
      input.updatedAt,
    );
  }

  get status(): UserStatus {
    return this._status;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  isDisabled(): boolean {
    return this._status === UserStatus.DISABLED;
  }

  disable(): void {
    if (this._status === UserStatus.DISABLED) {
      throw new UserAlreadyDisabledError(this.id);
    }

    this._status = UserStatus.DISABLED;
    this._updatedAt = new Date();
  }
}
