import { Logger } from '@nestjs/common';
import { EmailDeliveryException } from 'src/shared/exceptions/base/email-delivery.exception';
import { ForbiddenException } from 'src/shared/exceptions/base/forbidden.exception';
import { TooManyRequestsException } from 'src/shared/exceptions/base/too-many-requests.exception';
import { UnauthorizedException } from 'src/shared/exceptions/base/unauthorized.exception';
import { OTP_TTL_MS, RESEND_COOLDOWN_MS } from 'src/shared/constants/mfa.constants';
import type { PasswordHasherPort } from 'src/modules/iam/application/ports/password-hasher.port';
import type { EmailServicePort } from 'src/modules/auth/application/ports/email-service.port';
import type { OtpGeneratorPort } from 'src/modules/auth/application/ports/otp-generator.port';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';
import type { ElectorMfaChallengeRepository } from '../../domain/repositories/elector-mfa-challenge.repository.interface';

export class ResendElectorMfaUseCase {
  private readonly logger = new Logger(ResendElectorMfaUseCase.name);

  constructor(
    private readonly challenges: ElectorMfaChallengeRepository,
    private readonly electors: ElectorRepository,
    private readonly otpGenerator: OtpGeneratorPort,
    private readonly hasher: PasswordHasherPort,
    private readonly emailService: EmailServicePort,
  ) {}

  async execute(input: { sessionId: string }) {
    const challenge = await this.challenges.findBySessionId(input.sessionId);
    if (!challenge || challenge.isConsumed()) {
      throw new UnauthorizedException('Authentication session is invalid.');
    }

    const elector = await this.electors.findById(challenge.electorId);
    if (!elector || !elector.isActive()) {
      throw new ForbiddenException('Elector account is disabled.');
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
      await this.emailService.sendVerificationCode(elector.email, otp);
    } catch (error) {
      this.logger.error('Failed to send elector MFA verification email', error);
      await this.challenges.deleteBySessionId(challenge.sessionId);
      throw new EmailDeliveryException('Unable to send verification email.');
    }

    return { message: 'A new verification code has been sent.' };
  }
}
