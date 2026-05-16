import { RoleName } from "src/modules/users/domain/value-objects/role-name.vo";

export class AuthResponseDto {
  accessToken!: string;
  user!: {
    id: string;
    email: string;
    role: RoleName;
  };

  constructor(partial: Partial<AuthResponseDto>) {
    Object.assign(this, partial);
  }
}
