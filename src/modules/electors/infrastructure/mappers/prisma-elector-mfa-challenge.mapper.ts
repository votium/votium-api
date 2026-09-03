import { ElectorMfaChallengeEntity } from '../../domain/entities/elector-mfa-challenge.entity';

export class PrismaElectorMfaChallengeMapper {
  static toDomain(row: {
    id: string;
    elector_id: string;
    session_id: string;
    otp_hash: string;
    attempts: number;
    expires_at: Date;
    resend_at: Date | null;
    consumed_at: Date | null;
    created_at: Date;
  }): ElectorMfaChallengeEntity {
    return new ElectorMfaChallengeEntity(
      row.id,
      row.elector_id,
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
