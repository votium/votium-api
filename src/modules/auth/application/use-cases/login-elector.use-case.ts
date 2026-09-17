import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { EmailDeliveryException } from 'src/shared/exceptions/base/email-delivery.exception';
import { UnauthorizedException } from 'src/shared/exceptions/base/unauthorized.exception';
import { OTP_TTL_MS, RESEND_COOLDOWN_MS } from 'src/shared/constants/mfa.constants';
import type { PasswordHasherPort } from 'src/modules/iam/application/ports/password-hasher.port';
import type { EmailServicePort } from 'src/modules/auth/application/ports/email-service.port';
import type { OtpGeneratorPort } from 'src/modules/auth/application/ports/otp-generator.port';
import type { ElectorRepository } from 'src/modules/electors/domain/repositories/elector.repository.interface';
import type { ElectorMfaChallengeRepository } from '../../domain/repositories/elector-mfa-challenge.repository.interface';

export class LoginElectorUseCase {
  private readonly logger = new Logger(LoginElectorUseCase.name);

  constructor(
    private readonly electors: ElectorRepository,
    private readonly hasher: PasswordHasherPort,
    private readonly challenges: ElectorMfaChallengeRepository,
    private readonly otpGenerator: OtpGeneratorPort,
    private readonly emailService: EmailServicePort,
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

    const sessionId = randomUUID();
    const otp = this.otpGenerator.generate();
    const otpHash = await this.hasher.hash(otp);
    const now = new Date();

    await this.challenges.invalidateByElectorId(elector.id);

    const challenge = await this.challenges.create({
      electorId: elector.id,
      sessionId,
      otpHash,
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      resendAt: new Date(now.getTime() + RESEND_COOLDOWN_MS),
    });

    try {
      await this.emailService.sendVerificationCode(elector.email, otp);
    } catch (error) {
      this.logger.error('Failed to send elector MFA verification email', error);
      await this.challenges.deleteBySessionId(challenge.sessionId);
      throw new EmailDeliveryException('Unable to send verification email.');
    }

    return {
      mfaRequired: true,
      sessionId,
      expiresIn: OTP_TTL_MS / 1000,
      message: 'A verification code has been sent to your registered email.',
    };
  }
}
