import { Inject, Injectable } from '@nestjs/common';
import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';
import { ForbiddenException } from 'src/shared/exceptions/base/forbidden.exception';
import { GoneException } from 'src/shared/exceptions/base/gone.exception';
import { UnauthorizedException } from 'src/shared/exceptions/base/unauthorized.exception';
import { envs } from 'src/config';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/modules/iam/domain/repositories/user.repository.interface';
import {
  PASSWORD_HASHER_PORT,
  type PasswordHasherPort,
} from 'src/modules/iam/application/ports/password-hasher.port';
import {
  AUDIT_LOG_PORT,
  type AuditLogPort,
} from 'src/modules/iam/application/ports/audit-log.port';
import { UserStatus } from 'src/modules/iam/domain/value-objects/user-status.vo';
import {
  MFA_CHALLENGE_REPOSITORY,
  type MfaChallengeRepository,
} from 'src/modules/auth/domain/repositories/mfa-challenge.repository.interface';
import { MAX_VERIFICATION_ATTEMPTS } from 'src/modules/auth/domain/mfa.constants';
import { TOKEN_SERVICE_PORT, type TokenServicePort } from '../ports/token-service.port';

@Injectable()
export class VerifyMfaUseCase {
  constructor(
    @Inject(MFA_CHALLENGE_REPOSITORY) private readonly challenges: MfaChallengeRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER_PORT) private readonly hasher: PasswordHasherPort,
    @Inject(TOKEN_SERVICE_PORT) private readonly tokens: TokenServicePort,
    @Inject(AUDIT_LOG_PORT) private readonly audit: AuditLogPort,
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
      await this.audit.log('MFA_VERIFY_FAILED', challenge.userId, { sessionId: input.sessionId });
      throw new BadRequestException('Invalid verification code.');
    }

    challenge.consume(now);
    await this.challenges.save(challenge);

    const user = await this.users.findById(challenge.userId);
    if (!user || user.status === UserStatus.DISABLED) {
      throw new ForbiddenException('User account is disabled.');
    }

    const payload = { sub: user.id, email: user.email, role: user.role.value };
    const accessToken = await this.tokens.signAccessToken(payload);

    await this.audit.log('MFA_VERIFY_SUCCESS', user.id, { sessionId: input.sessionId });

    return { accessToken, expiresIn: envs.jwtExpiresIn };
  }
}
