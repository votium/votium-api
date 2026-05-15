import { RoleName } from "src/modules/users/domain/value-objects/role-name.vo";

export interface TokenServicePort {
  signAccessToken(payload: {
    sub: string;
    email: string;
    role: RoleName;
  }): Promise<string>;

  verifyAccessToken(token: string): Promise<{
    sub: string;
    email: string;
    role: RoleName;
  }>;
}
