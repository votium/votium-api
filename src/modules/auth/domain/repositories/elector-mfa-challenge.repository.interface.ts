import { ElectorMfaChallengeEntity } from '../entities/elector-mfa-challenge.entity';

export const ELECTOR_MFA_CHALLENGE_REPOSITORY = 'ElectorMfaChallengeRepository';

export interface ElectorMfaChallengeCreateInput {
  electorId: string;
  sessionId: string;
  otpHash: string;
  expiresAt: Date;
  resendAt: Date | null;
}

export interface ElectorMfaChallengeRepository {
  create(input: ElectorMfaChallengeCreateInput): Promise<ElectorMfaChallengeEntity>;
  findBySessionId(sessionId: string): Promise<ElectorMfaChallengeEntity | null>;
  save(challenge: ElectorMfaChallengeEntity): Promise<void>;
  deleteBySessionId(sessionId: string): Promise<void>;
  invalidateByElectorId(electorId: string): Promise<void>;
}
