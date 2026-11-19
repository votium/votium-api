import { CertificateEntity } from '../../domain/entities/certificate.entity';

export type PrismaCertificateRow = {
  id: string;
  electoral_roll_id: string;
  election_id: string;
  verification_code: string;
  created_at: Date;
};

export class PrismaCertificateMapper {
  static toDomain(row: PrismaCertificateRow): CertificateEntity {
    return CertificateEntity.restore({
      id: row.id,
      electoralRollId: row.electoral_roll_id,
      electionId: row.election_id,
      verificationCode: row.verification_code,
      createdAt: row.created_at,
    });
  }
}
