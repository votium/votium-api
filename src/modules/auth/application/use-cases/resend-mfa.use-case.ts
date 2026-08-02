import { Inject, Injectable, Logger } from '@nestjs/common';
import { EmailDeliveryException } from 'src/shared/exceptions/base/email-delivery.exception';
import { ForbiddenException } from 'src/shared/exceptions/base/forbidden.exception';
import { TooManyRequestsException } from 'src/shared/exceptions/base/too-many-requests.exception';
import { UnauthorizedException } from 'src/shared/exceptions/base/unauthorized.exception';
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
import { OTP_TTL_MS, RESEND_COOLDOWN_MS } from 'src/modules/auth/domain/mfa.constants';
import { EMAIL_SERVICE_PORT, type EmailServicePort } from '../ports/email-service.port';
import { OTP_GENERATOR_PORT, type OtpGeneratorPort } from '../ports/otp-generator.port';

@Injectable()
export class ResendMfaUseCase {
  private readonly logger = new Logger(ResendMfaUseCase.name);

  constructor(
    @Inject(MFA_CHALLENGE_REPOSITORY) private readonly challenges: MfaChallengeRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(OTP_GENERATOR_PORT) private readonly otpGenerator: OtpGeneratorPort,
    @Inject(PASSWORD_HASHER_PORT) private readonly hasher: PasswordHasherPort,
    @Inject(EMAIL_SERVICE_PORT) private readonly emailService: EmailServicePort,
    @Inject(AUDIT_LOG_PORT) private readonly audit: AuditLogPort,
  ) {}

  async execute(input: { sessionId: string }) {
    const challenge = await this.challenges.findBySessionId(input.sessionId);
    if (!challenge || challenge.isConsumed()) {
      throw new UnauthorizedException('Authentication session is invalid.');
    }

    const user = await this.users.findById(challenge.userId);
    if (!user || user.status === UserStatus.DISABLED) {
      throw new ForbiddenException('User account is disabled.');
    }

    const now = new Date();
    if (challenge.resendAt && challenge.resendAt.getTime() > now.getTime()) {
      throw new TooManyRequestsException('Too many verification attempts. Please try again later.');
    }

    const otp = this.otpGenerator.generate();
    const otpHash = await this.hasher.hash(otp);
    challenge.rotate(
      otpHash,
      new Date(now.getTime() + OTP_TTL_MS),
      new Date(now.getTime() + RESEND_COOLDOWN_MS),
    );
    await this.challenges.save(challenge);

    try {
      await this.emailService.sendVerificationCode(user.email, otp);
    } catch (error) {
      this.logger.error('Failed to send MFA verification email', error);
      await this.challenges.deleteBySessionId(challenge.sessionId);
      throw new EmailDeliveryException('Unable to send verification email.');
    }

    await this.audit.log('MFA_RESEND', user.id, { sessionId: input.sessionId });

    return { message: 'A new verification code has been sent.' };
  }
}
