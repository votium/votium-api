import { Logger } from '@nestjs/common';
import {
  GENERIC_PASSWORD_RECOVERY_MESSAGE,
  PASSWORD_RECOVERY_RESEND_COOLDOWN_MS,
  PASSWORD_RECOVERY_TTL_MS,
} from 'src/shared/constants/password-recovery.constants';
import type { UserRepository } from 'src/modules/iam/domain/repositories/user.repository.interface';
import type { PasswordRecoveryCodeRepository } from '../../domain/repositories/password-recovery-code.repository.interface';
import type { MfaHasherPort } from '../ports/mfa-hasher.port';
import type { OtpGeneratorPort } from '../ports/otp-generator.port';
import type { PasswordRecoveryEmailPort } from '../ports/password-recovery-email.port';

// Starts the password recovery of administrators and auditors (users). Always returns the same generic message (whether
// the account exists, is inside the resend cooldown or the email fails) to avoid account
// enumeration. Only the hash of the code is stored; the code is never logged.
export class RequestUserPasswordRecoveryUseCase {
  private readonly logger = new Logger(RequestUserPasswordRecoveryUseCase.name);

  constructor(
    private readonly accounts: UserRepository,
    private readonly recovery: PasswordRecoveryCodeRepository,
    private readonly otpGenerator: OtpGeneratorPort,
    private readonly mfaHasher: MfaHasherPort,
    private readonly email: PasswordRecoveryEmailPort,
  ) {}

  async execute(input: { email: string }): Promise<{ message: string }> {
    const generic = { message: GENERIC_PASSWORD_RECOVERY_MESSAGE };

    const account = await this.accounts.findByEmail(input.email);
    if (!account?.id || account.isDeleted() || !account.isActive()) return generic;
    const userId = account.id;

    const now = new Date();
    const activeCreatedAt = await this.recovery.findActiveCreatedAt(userId, now);
    if (
      activeCreatedAt &&
      now.getTime() - activeCreatedAt.getTime() < PASSWORD_RECOVERY_RESEND_COOLDOWN_MS
    ) {
      return generic;
    }

    const code = this.otpGenerator.generate();
    const codeHash = await this.mfaHasher.hash(code);
    await this.recovery.replaceActive({
      userId,
      codeHash,
      expiresAt: new Date(now.getTime() + PASSWORD_RECOVERY_TTL_MS),
    });

    try {
      await this.email.sendPasswordRecoveryCode(account.email, code);
    } catch (error) {
      // A code the user never received must not stay active.
      await this.recovery.deleteByUserId(userId);
      this.logger.error('Failed to send password recovery email', error);
    }

    return generic;
  }
}
