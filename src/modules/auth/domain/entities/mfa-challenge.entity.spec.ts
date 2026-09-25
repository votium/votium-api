import { MfaChallengeEntity } from './mfa-challenge.entity';

describe('MfaChallengeEntity', () => {
  const createdAt = new Date('2026-07-31T10:00:00.000Z');
  const expiresAt = new Date('2026-07-31T10:05:00.000Z');

  function buildChallenge(overrides: Partial<MfaChallengeEntity> = {}): MfaChallengeEntity {
    return new MfaChallengeEntity(
      overrides.id ?? 'challenge-1',
      overrides.userId ?? 'user-1',
      overrides.sessionId ?? 'session-1',
      overrides.otpHash ?? 'pbkdf2$hash',
      overrides.attempts ?? 0,
      overrides.expiresAt ?? expiresAt,
      overrides.resendAt ?? new Date('2026-07-31T10:01:00.000Z'),
      overrides.consumedAt ?? null,
      overrides.createdAt ?? createdAt,
    );
  }

  it('is expired when now is after expiresAt', () => {
    const challenge = buildChallenge();
    expect(challenge.isExpired(new Date('2026-07-31T10:06:00.000Z'))).toBe(true);
  });

  it('is not expired exactly at expiresAt boundary', () => {
    const challenge = buildChallenge();
    expect(challenge.isExpired(new Date('2026-07-31T10:05:00.000Z'))).toBe(false);
  });

  it('is not expired before expiresAt', () => {
    const challenge = buildChallenge();
    expect(challenge.isExpired(new Date('2026-07-31T10:04:00.000Z'))).toBe(false);
  });

  it('is consumed when consumedAt is set', () => {
    const challenge = buildChallenge({ consumedAt: new Date('2026-07-31T10:01:00.000Z') });
    expect(challenge.isConsumed()).toBe(true);
  });

  it('is not consumed by default', () => {
    const challenge = buildChallenge();
    expect(challenge.isConsumed()).toBe(false);
  });

  it('has exceeded attempts at the max boundary', () => {
    const challenge = buildChallenge({ attempts: 5 });
    expect(challenge.hasExceededAttempts(5)).toBe(true);
  });

  it('has not exceeded attempts below the max', () => {
    const challenge = buildChallenge({ attempts: 4 });
    expect(challenge.hasExceededAttempts(5)).toBe(false);
  });

  it('registers a failed attempt by incrementing attempts', () => {
    const challenge = buildChallenge({ attempts: 1 });
    challenge.registerFailedAttempt();
    expect(challenge.attempts).toBe(2);
  });

  it('marks the challenge as consumed', () => {
    const challenge = buildChallenge();
    const now = new Date('2026-07-31T10:02:00.000Z');
    challenge.consume(now);
    expect(challenge.consumedAt).toEqual(now);
    expect(challenge.isConsumed()).toBe(true);
  });
});
