import { Inject, Injectable } from '@nestjs/common';
import { InvalidCredentialsException } from '../../domain/exceptions/invalid-credentials.exception';
import type { UserRepository } from 'src/modules/users/domain/repositories/user.repository.interface';
import { USER_REPOSITORY } from 'src/modules/users/domain/repositories/tokens';
import type { PasswordHasherPort } from 'src/modules/users/application/ports/password-hasher.port';
import { PASSWORD_HASHER_PORT } from 'src/modules/users/application/ports/tokens';
import type { TokenServicePort } from '../ports/token-service.port';
import { TOKEN_SERVICE_PORT } from '../ports/tokens';
import { UserStatus } from 'src/modules/users/domain/value-objects/user-status.vo';

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER_PORT) private readonly hasher: PasswordHasherPort,
    @Inject(TOKEN_SERVICE_PORT) private readonly tokens: TokenServicePort,
  ) {}

  async execute(input: { email: string; password: string }) {
    const user = await this.users.findByEmail(input.email);
    if (!user) throw new InvalidCredentialsException();

    if (user.status === UserStatus.DISABLED) throw new InvalidCredentialsException();

    const ok = await this.hasher.verify(input.password, user.passwordHash);
    if (!ok) throw new InvalidCredentialsException();

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
