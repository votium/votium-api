import { envs } from 'src/config';
import { NotFoundException } from 'src/shared/exceptions/base/not-found.exception';
import { UnauthorizedException } from 'src/shared/exceptions/base/unauthorized.exception';
import type { PasswordHasherPort } from 'src/modules/iam/application/ports/password-hasher.port';
import type { TokenServicePort } from 'src/modules/auth/application/ports/token-service.port';
import type { ElectorRepository } from 'src/modules/electors/domain/repositories/elector.repository.interface';

/**
 * Elector login without MFA, intended only for test accounts that cannot receive OTP emails.
 * Guarded by `ELECTOR_DIRECT_LOGIN_ENABLED`; when disabled the endpoint behaves as nonexistent.
 */
export class LoginElectorDirectUseCase {
  constructor(
    private readonly electors: ElectorRepository,
    private readonly hasher: PasswordHasherPort,
    private readonly tokens: TokenServicePort,
    private readonly enabled: boolean,
  ) {}

  async execute(input: { email: string; password: string }) {
    if (!this.enabled) throw new NotFoundException('Resource');

    const elector = await this.electors.findByEmail(input.email);
    if (!elector || !elector.isActive() || !elector.id) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const ok = await this.hasher.verify(input.password, elector.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials.');

    const payload = { sub: elector.id, email: elector.email, actorType: 'ELECTOR' as const };
    const accessToken = await this.tokens.signAccessToken(payload);

    return { accessToken, expiresIn: envs.jwtExpiresIn };
  }
}
