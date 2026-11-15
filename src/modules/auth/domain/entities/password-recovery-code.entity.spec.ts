import { PasswordRecoveryCodeEntity } from './password-recovery-code.entity';

const expiresAt = new Date('2026-11-10T12:15:00.000Z');

function build(attempts = 0, consumedAt: Date | null = null): PasswordRecoveryCodeEntity {
  return new PasswordRecoveryCodeEntity(
    'code-1',
    'hash',
    attempts,
    expiresAt,
    consumedAt,
    new Date('2026-11-10T12:00:00.000Z'),
  );
}

describe('PasswordRecoveryCodeEntity', () => {
  it('is not expired before expiresAt and expired at or after it', () => {
    const code = build();
    expect(code.isExpired(new Date(expiresAt.getTime() - 1))).toBe(false);
    expect(code.isExpired(expiresAt)).toBe(true);
    expect(code.isExpired(new Date(expiresAt.getTime() + 1))).toBe(true);
  });

  it('reports consumption and consume() marks it', () => {
    const code = build();
    expect(code.isConsumed()).toBe(false);
    const now = new Date('2026-11-10T12:05:00.000Z');
    code.consume(now);
    expect(code.isConsumed()).toBe(true);
    expect(code.consumedAt).toEqual(now);
  });

  it('exceeds attempts only when reaching the max', () => {
    expect(build(4).hasExceededAttempts(5)).toBe(false);
    expect(build(5).hasExceededAttempts(5)).toBe(true);
  });

  it('registerFailedAttempt increments the counter', () => {
    const code = build(1);
    code.registerFailedAttempt();
    expect(code.attempts).toBe(2);
  });
});
