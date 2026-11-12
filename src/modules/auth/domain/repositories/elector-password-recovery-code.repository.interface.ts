import type { ConsumeRecoveryCodeOutcome } from './password-recovery-code.repository.interface';

export const ELECTOR_PASSWORD_RECOVERY_CODE_REPOSITORY = 'ElectorPasswordRecoveryCodeRepository';

// Recovery codes of voters (electors table). Same contract as the users context, kept in a
// separate table so a code of one context can never reset the other.
export interface ElectorPasswordRecoveryCodeRepository {
  replaceActive(input: { electorId: string; codeHash: string; expiresAt: Date }): Promise<void>;

  deleteByElectorId(electorId: string): Promise<void>;

  findActiveCreatedAt(electorId: string, now: Date): Promise<Date | null>;

  consumeAndResetPassword(input: {
    electorId: string;
    codeHash: string;
    passwordHash: string;
    now: Date;
  }): Promise<ConsumeRecoveryCodeOutcome>;
}
