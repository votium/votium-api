export const VOTER_CERTIFICATE_READER = 'VoterCertificateReader';

export type VoterCertificateStatus = 'AVAILABLE' | 'PROCESSING';

export interface VoterCertificateSummary {
  electionId: string;
  electionName: string;
  votingDate: Date;
  status: VoterCertificateStatus;
  // Null until the elector generates the certificate.
  verificationCode: string | null;
  issuedAt: Date | null;
}

export interface FindVoterCertificatesParams {
  electorId: string;
  page: number;
  limit: number;
}

export interface VoterCertificatePage {
  items: VoterCertificateSummary[];
  total: number;
}

// Read-only listing of the certificates an elector can generate, already issued or still
// awaiting ledger confirmation.
export interface VoterCertificateReader {
  findByElectorId(params: FindVoterCertificatesParams): Promise<VoterCertificatePage>;
}
