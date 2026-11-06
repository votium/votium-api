import { MfaChallengeEntity } from '../entities/mfa-challenge.entity';

export const MFA_CHALLENGE_REPOSITORY = 'MfaChallengeRepository';

export interface MfaChallengeCreateInput {
  userId: string;
  sessionId: string;
  otpHash: string;
  expiresAt: Date;
  resendAt: Date | null;
}

export interface MfaChallengeRepository {
  create(input: MfaChallengeCreateInput): Promise<MfaChallengeEntity>;
  findBySessionId(sessionId: string): Promise<MfaChallengeEntity | null>;
  save(challenge: MfaChallengeEntity): Promise<void>;
  deleteBySessionId(sessionId: string): Promise<void>;
  invalidateByUserId(userId: string): Promise<void>;
}
