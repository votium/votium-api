import { Logger } from '@nestjs/common';
import { ForbiddenException } from 'src/shared/exceptions/base/forbidden.exception';
import { TooManyRequestsException } from 'src/shared/exceptions/base/too-many-requests.exception';
import { UnauthorizedException } from 'src/shared/exceptions/base/unauthorized.exception';
import { OTP_TTL_MS, RESEND_COOLDOWN_MS } from 'src/shared/constants/mfa.constants';
import type { MfaHasherPort } from 'src/modules/auth/application/ports/mfa-hasher.port';
import type { AsyncEmailServicePort } from 'src/modules/auth/application/ports/async-email-service.port';
import type { OtpGeneratorPort } from 'src/modules/auth/application/ports/otp-generator.port';
import type { ElectorRepository } from 'src/modules/electors/domain/repositories/elector.repository.interface';
import type { ElectorMfaChallengeRepository } from '../../domain/repositories/elector-mfa-challenge.repository.interface';

export class ResendElectorMfaUseCase {
  private readonly logger = new Logger(ResendElectorMfaUseCase.name);

  constructor(
    private readonly challenges: ElectorMfaChallengeRepository,
    private readonly electors: ElectorRepository,
    private readonly otpGenerator: OtpGeneratorPort,
    private readonly mfaHasher: MfaHasherPort,
    private readonly emailService: AsyncEmailServicePort,
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
    const otpHash = await this.mfaHasher.hash(otp);
    challenge.rotate(
      otpHash,
      new Date(now.getTime() + OTP_TTL_MS),
      new Date(now.getTime() + RESEND_COOLDOWN_MS),
    );
    await this.challenges.save(challenge);

    try {
      await this.emailService.queueVerificationCode(elector.email, otp);
    } catch (error) {
      this.logger.error('Failed to queue elector MFA verification email', error);
    }

    return { message: 'A new verification code has been sent.' };
  }
}
