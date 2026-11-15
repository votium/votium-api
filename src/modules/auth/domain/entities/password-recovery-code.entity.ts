// Shared by both recovery contexts (users and electors); the owning account lives in
// the table of each context, so the entity only carries the code lifecycle.
export class PasswordRecoveryCodeEntity {
  constructor(
    public readonly id: string,
    public readonly codeHash: string,
    public attempts: number,
    public readonly expiresAt: Date,
    public consumedAt: Date | null,
    public readonly createdAt: Date,
  ) {}

  isExpired(now: Date): boolean {
    return now.getTime() >= this.expiresAt.getTime();
  }

  isConsumed(): boolean {
    return this.consumedAt !== null;
  }

  hasExceededAttempts(max: number): boolean {
    return this.attempts >= max;
  }

  registerFailedAttempt(): void {
    this.attempts += 1;
  }

  consume(now: Date): void {
    this.consumedAt = now;
  }
}
