import { MfaChallengeEntity } from '../../domain/entities/mfa-challenge.entity';

export class PrismaMfaChallengeMapper {
  static toDomain(row: {
    id: string;
    user_id: string;
    session_id: string;
    otp_hash: string;
    attempts: number;
    expires_at: Date;
    resend_at: Date | null;
    consumed_at: Date | null;
    created_at: Date;
  }): MfaChallengeEntity {
    return new MfaChallengeEntity(
      row.id,
      row.user_id,
      row.session_id,
      row.otp_hash,
      row.attempts,
      row.expires_at,
      row.resend_at,
      row.consumed_at,
      row.created_at,
    );
  }
}
