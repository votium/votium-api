import { PasswordRecoveryCodeEntity } from '../../domain/entities/password-recovery-code.entity';

// Structural row shared by password_recovery_codes and elector_password_recovery_codes.
export type PasswordRecoveryCodeRow = {
  id: string;
  code_hash: string;
  attempts: number;
  expires_at: Date;
  consumed_at: Date | null;
  created_at: Date;
};

export class PrismaPasswordRecoveryCodeMapper {
  static toDomain(row: PasswordRecoveryCodeRow): PasswordRecoveryCodeEntity {
    return new PasswordRecoveryCodeEntity(
      row.id,
      row.code_hash,
      row.attempts,
      row.expires_at,
      row.consumed_at,
      row.created_at,
    );
  }
}
