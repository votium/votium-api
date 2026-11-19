import type { CertificateEntity } from '../entities/certificate.entity';

export const CERTIFICATE_REPOSITORY = 'CertificateRepository';

export interface EnsureCertificateInput {
  electoralRollId: string;
  electionId: string;
}

export interface CertificateRepository {
  findByElectoralRollId(electoralRollId: string): Promise<CertificateEntity | null>;
  // Idempotent per electoral roll row: returns the existing certificate (same verification
  // code) or atomically creates one with a new random code.
  ensureForRoll(input: EnsureCertificateInput): Promise<CertificateEntity>;
}
