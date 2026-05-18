import { RoleName } from '../../domain/value-objects/role-name.vo';

export class UserResponseDto {
  id!: string;
  name!: string;
  email!: string;
  role!: RoleName;

  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}
