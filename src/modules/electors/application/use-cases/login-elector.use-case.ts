import { UnauthorizedException } from 'src/shared/exceptions/base/unauthorized.exception';
import { envs } from 'src/config';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';
import type { PasswordHasherPort } from 'src/modules/iam/application/ports/password-hasher.port';
import type { TokenServicePort } from 'src/modules/auth/application/ports/token-service.port';

export class LoginElectorUseCase {
  constructor(
    private readonly electors: ElectorRepository,
    private readonly hasher: PasswordHasherPort,
    private readonly tokens: TokenServicePort,
  ) {}

  async execute(input: { email: string; password: string }) {
    const elector = await this.electors.findByEmail(input.email);

    if (!elector) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (!elector.isActive()) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const ok = await this.hasher.verify(input.password, elector.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    if (!elector.id) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const payload = { sub: elector.id, email: elector.email, actorType: 'ELECTOR' as const };
    const accessToken = await this.tokens.signAccessToken(payload);

    return { accessToken, expiresIn: envs.jwtExpiresIn };
  }
}
