import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EmailDeliveryException } from 'src/shared/exceptions/base/email-delivery.exception';
import { ForbiddenException } from 'src/shared/exceptions/base/forbidden.exception';
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
import { OTP_TTL_MS, RESEND_COOLDOWN_MS } from 'src/shared/constants/mfa.constants';
import { EMAIL_SERVICE_PORT, type EmailServicePort } from '../ports/email-service.port';
import { OTP_GENERATOR_PORT, type OtpGeneratorPort } from '../ports/otp-generator.port';

@Injectable()
export class LoginUseCase {
  private readonly logger = new Logger(LoginUseCase.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER_PORT) private readonly hasher: PasswordHasherPort,
    @Inject(MFA_CHALLENGE_REPOSITORY) private readonly challenges: MfaChallengeRepository,
    @Inject(OTP_GENERATOR_PORT) private readonly otpGenerator: OtpGeneratorPort,
    @Inject(EMAIL_SERVICE_PORT) private readonly emailService: EmailServicePort,
    @Inject(AUDIT_LOG_PORT) private readonly audit: AuditLogPort,
  ) {}

  async execute(input: { email: string; password: string }) {
    const user = await this.users.findByEmail(input.email);
    if (!user) throw new UnauthorizedException('Invalid credentials.');

    if (user.status === UserStatus.DISABLED) {
      throw new ForbiddenException('User account is disabled.');
    }

    const passwordOk = await this.hasher.verify(input.password, user.passwordHash);
    if (!passwordOk) throw new UnauthorizedException('Invalid credentials.');

    const sessionId = randomUUID();
    const otp = this.otpGenerator.generate();
    const otpHash = await this.hasher.hash(otp);
    const now = new Date();

    await this.challenges.invalidateByUserId(user.id);

    await this.challenges.create({
      userId: user.id,
      sessionId,
      otpHash,
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      resendAt: new Date(now.getTime() + RESEND_COOLDOWN_MS),
    });

    try {
      await this.emailService.sendVerificationCode(user.email, otp);
    } catch (error) {
      this.logger.error('Failed to send MFA verification email', error);
      await this.challenges.deleteBySessionId(sessionId);
      throw new EmailDeliveryException('Unable to send verification email.');
    }

    await this.audit.log('MFA_OTP_SENT', user.id, { sessionId });

    return {
      mfaRequired: true,
      sessionId,
      expiresIn: OTP_TTL_MS / 1000,
      message: 'A verification code has been sent to your registered email.',
    };
  }
}
