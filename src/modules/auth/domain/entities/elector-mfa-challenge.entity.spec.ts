import { ElectorMfaChallengeEntity } from './elector-mfa-challenge.entity';

describe('ElectorMfaChallengeEntity', () => {
  const createdAt = new Date('2026-07-31T10:00:00.000Z');
  const expiresAt = new Date('2026-07-31T10:05:00.000Z');

  function buildChallenge(
    overrides: Partial<ElectorMfaChallengeEntity> = {},
  ): ElectorMfaChallengeEntity {
    return new ElectorMfaChallengeEntity(
      overrides.id ?? 'challenge-1',
      overrides.electorId ?? 'elector-1',
      overrides.sessionId ?? 'session-1',
      overrides.otpHash ?? 'pbkdf2$hash',
      overrides.attempts ?? 0,
      overrides.expiresAt ?? expiresAt,
      overrides.resendAt ?? new Date('2026-07-31T10:01:00.000Z'),
      overrides.consumedAt ?? null,
      overrides.createdAt ?? createdAt,
    );
  }

  it('E1: is expired when now is after expiresAt', () => {
    const challenge = buildChallenge();
    expect(challenge.isExpired(new Date('2026-07-31T10:06:00.000Z'))).toBe(true);
  });

  it('E2: is not expired exactly at expiresAt boundary', () => {
    const challenge = buildChallenge();
    expect(challenge.isExpired(new Date('2026-07-31T10:05:00.000Z'))).toBe(false);
  });

  it('E3: is not expired before expiresAt', () => {
    const challenge = buildChallenge();
    expect(challenge.isExpired(new Date('2026-07-31T10:04:00.000Z'))).toBe(false);
  });

  it('E4: is consumed when consumedAt is set', () => {
    const challenge = buildChallenge({ consumedAt: new Date('2026-07-31T10:01:00.000Z') });
    expect(challenge.isConsumed()).toBe(true);
  });

  it('E5: is not consumed by default', () => {
    const challenge = buildChallenge();
    expect(challenge.isConsumed()).toBe(false);
  });

  it('E6: has exceeded attempts at the max boundary', () => {
    const challenge = buildChallenge({ attempts: 5 });
    expect(challenge.hasExceededAttempts(5)).toBe(true);
  });

  it('E7: has not exceeded attempts below the max', () => {
    const challenge = buildChallenge({ attempts: 4 });
    expect(challenge.hasExceededAttempts(5)).toBe(false);
  });

  it('E8: registers a failed attempt by incrementing attempts', () => {
    const challenge = buildChallenge({ attempts: 1 });
    challenge.registerFailedAttempt();
    expect(challenge.attempts).toBe(2);
  });

  it('E9: marks the challenge as consumed', () => {
    const challenge = buildChallenge();
    const now = new Date('2026-07-31T10:02:00.000Z');
    challenge.consume(now);
    expect(challenge.consumedAt).toEqual(now);
    expect(challenge.isConsumed()).toBe(true);
  });

  it('E10: rotates the OTP, resets attempts and clears consumedAt', () => {
    const challenge = buildChallenge({
      attempts: 3,
      consumedAt: new Date('2026-07-31T10:02:00.000Z'),
    });
    const newExpires = new Date('2026-07-31T10:07:00.000Z');
    const newResend = new Date('2026-07-31T10:03:00.000Z');

    challenge.rotate('pbkdf2$new-hash', newExpires, newResend);

    expect(challenge.otpHash).toBe('pbkdf2$new-hash');
    expect(challenge.attempts).toBe(0);
    expect(challenge.expiresAt).toEqual(newExpires);
    expect(challenge.resendAt).toEqual(newResend);
    expect(challenge.consumedAt).toBeNull();
  });
});
