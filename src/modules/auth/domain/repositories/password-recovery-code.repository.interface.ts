export const PASSWORD_RECOVERY_CODE_REPOSITORY = 'PasswordRecoveryCodeRepository';

export type ConsumeRecoveryCodeOutcome =
  | 'updated'
  | 'invalid'
  | 'expired'
  | 'used'
  | 'attempts_exceeded';

// Recovery codes of administrators/auditors (users table). Codes are stored only as hashes.
export interface PasswordRecoveryCodeRepository {
  // Atomically removes any previous code of the account and stores the new one, so only one
  // code is valid per account.
  replaceActive(input: { userId: string; codeHash: string; expiresAt: Date }): Promise<void>;

  // Removes every code of the account (used when the recovery email cannot be delivered).
  deleteByUserId(userId: string): Promise<void>;

  // created_at of the account's current code (not consumed and not expired at `now`), or null.
  findActiveCreatedAt(userId: string, now: Date): Promise<Date | null>;

  // In a single transaction: validates the latest code (exists, not consumed, not expired,
  // attempts and hash), consumes it and updates the account password_hash. A wrong hash
  // increments attempts (the code is removed when the max is reached). If the account is no
  // longer active the whole transaction is rolled back and 'invalid' is returned.
  consumeAndResetPassword(input: {
    userId: string;
    codeHash: string;
    passwordHash: string;
    now: Date;
  }): Promise<ConsumeRecoveryCodeOutcome>;
}
