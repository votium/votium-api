import { Inject, Injectable } from "@nestjs/common";
import { ValidationError } from "src/shared/exceptions/errors/validation.error";
import type { UserRepository } from "src/modules/users/domain/repositories/user.repository.interface";
import { USER_REPOSITORY } from "src/modules/users/domain/repositories/tokens";
import type { PasswordHasherPort } from "src/modules/users/application/ports/password-hasher.port";
import { PASSWORD_HASHER_PORT } from "src/modules/users/application/ports/tokens";
import type { TokenServicePort } from "../ports/token-service.port";
import { TOKEN_SERVICE_PORT } from "../ports/tokens";

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER_PORT) private readonly hasher: PasswordHasherPort,
    @Inject(TOKEN_SERVICE_PORT) private readonly tokens: TokenServicePort,
  ) {}

  async execute(input: { email: string; password: string }) {
    const user = await this.users.findByEmail(input.email);
    if (!user) throw new ValidationError("Credenciales invalidas");

    const ok = await this.hasher.verify(input.password, user.passwordHash);
    if (!ok) throw new ValidationError("Credenciales invalidas");

    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }
}
