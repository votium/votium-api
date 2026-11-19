export const VOTER_CERTIFICATE_READER = 'VoterCertificateReader';

export interface VoterCertificateSummary {
  electionId: string;
  electionName: string;
  votingDate: Date;
  verificationCode: string;
  issuedAt: Date;
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

// Read-only listing of certificates already issued to an elector (TS-253).
export interface VoterCertificateReader {
  findByElectorId(params: FindVoterCertificatesParams): Promise<VoterCertificatePage>;
}
