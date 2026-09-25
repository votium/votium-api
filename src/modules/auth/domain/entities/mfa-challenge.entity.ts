export class MfaChallengeEntity {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly sessionId: string,
    public otpHash: string,
    public attempts: number,
    public expiresAt: Date,
    public resendAt: Date | null,
    public consumedAt: Date | null,
    public readonly createdAt: Date,
  ) {}

  isExpired(now: Date): boolean {
    return now.getTime() > this.expiresAt.getTime();
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

  rotate(otpHash: string, expiresAt: Date, resendAt: Date): void {
    this.otpHash = otpHash;
    this.attempts = 0;
    this.expiresAt = expiresAt;
    this.resendAt = resendAt;
    this.consumedAt = null;
  }
}
