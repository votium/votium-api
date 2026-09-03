import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';
import { ForbiddenException } from 'src/shared/exceptions/base/forbidden.exception';
import { GoneException } from 'src/shared/exceptions/base/gone.exception';
import { UnauthorizedException } from 'src/shared/exceptions/base/unauthorized.exception';
import { envs } from 'src/config';
import { MAX_VERIFICATION_ATTEMPTS } from 'src/shared/constants/mfa.constants';
import type { PasswordHasherPort } from 'src/modules/iam/application/ports/password-hasher.port';
import type { TokenServicePort } from 'src/modules/auth/application/ports/token-service.port';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';
import type { ElectorMfaChallengeRepository } from '../../domain/repositories/elector-mfa-challenge.repository.interface';

export class VerifyElectorMfaUseCase {
  constructor(
    private readonly challenges: ElectorMfaChallengeRepository,
    private readonly electors: ElectorRepository,
    private readonly hasher: PasswordHasherPort,
    private readonly tokens: TokenServicePort,
  ) {}

  async execute(input: { sessionId: string; code: string }) {
    const challenge = await this.challenges.findBySessionId(input.sessionId);
    if (!challenge) throw new UnauthorizedException('Authentication session is invalid.');

    if (challenge.isConsumed()) {
      throw new BadRequestException('Verification code has already been used.');
    }

    const now = new Date();
    if (challenge.isExpired(now)) throw new GoneException('Verification code has expired.');

    if (challenge.hasExceededAttempts(MAX_VERIFICATION_ATTEMPTS)) {
      await this.challenges.deleteBySessionId(challenge.sessionId);
      throw new BadRequestException('Maximum verification attempts exceeded.');
    }

    const codeOk = await this.hasher.verify(input.code, challenge.otpHash);
    if (!codeOk) {
      challenge.registerFailedAttempt();
      if (challenge.hasExceededAttempts(MAX_VERIFICATION_ATTEMPTS)) {
        await this.challenges.deleteBySessionId(challenge.sessionId);
        throw new BadRequestException('Maximum verification attempts exceeded.');
      }
      await this.challenges.save(challenge);
      throw new BadRequestException('Invalid verification code.');
    }

    challenge.consume(now);
    await this.challenges.save(challenge);

    const elector = await this.electors.findById(challenge.electorId);
    if (!elector || !elector.isActive()) {
      throw new ForbiddenException('Elector account is disabled.');
    }

    if (!elector.id) {
      throw new ForbiddenException('Elector account is disabled.');
    }

    const payload = { sub: elector.id, email: elector.email, actorType: 'ELECTOR' as const };
    const accessToken = await this.tokens.signAccessToken(payload);

    return { accessToken, expiresIn: envs.jwtExpiresIn };
  }
}
