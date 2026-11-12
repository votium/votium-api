import type { PasswordHasherPort } from 'src/modules/iam/application/ports/password-hasher.port';
import { PASSWORD_RESET_SUCCESS_MESSAGE } from 'src/shared/constants/password-recovery.constants';
import type { ElectorRepository } from 'src/modules/electors/domain/repositories/elector.repository.interface';
import { ExpiredRecoveryCodeException } from '../../domain/exceptions/expired-recovery-code.exception';
import { InvalidRecoveryCodeException } from '../../domain/exceptions/invalid-recovery-code.exception';
import { RecoveryCodeAlreadyUsedException } from '../../domain/exceptions/recovery-code-already-used.exception';
import type { ElectorPasswordRecoveryCodeRepository } from '../../domain/repositories/elector-password-recovery-code.repository.interface';
import type { MfaHasherPort } from '../ports/mfa-hasher.port';

// Completes the password recovery of voters (electors): validates the code and updates the password
// atomically in the repository. Only the code hash is passed down, never the code.
export class ResetElectorPasswordUseCase {
  constructor(
    private readonly accounts: ElectorRepository,
    private readonly recovery: ElectorPasswordRecoveryCodeRepository,
    private readonly mfaHasher: MfaHasherPort,
    private readonly passwordHasher: PasswordHasherPort,
  ) {}

  async execute(input: {
    email: string;
    code: string;
    newPassword: string;
  }): Promise<{ message: string }> {
    const account = await this.accounts.findByEmail(input.email);
    if (!account?.id || account.isDeleted() || !account.isActive()) {
      throw new InvalidRecoveryCodeException();
    }

    const codeHash = await this.mfaHasher.hash(input.code);
    const passwordHash = await this.passwordHasher.hash(input.newPassword);
    const outcome = await this.recovery.consumeAndResetPassword({
      electorId: account.id,
      codeHash,
      passwordHash,
      now: new Date(),
    });

    if (outcome === 'expired') throw new ExpiredRecoveryCodeException();
    if (outcome === 'used') throw new RecoveryCodeAlreadyUsedException();
    if (outcome !== 'updated') throw new InvalidRecoveryCodeException();

    return { message: PASSWORD_RESET_SUCCESS_MESSAGE };
  }
}
