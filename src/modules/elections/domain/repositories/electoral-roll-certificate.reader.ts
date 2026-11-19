export const ELECTORAL_ROLL_CERTIFICATE_READER = 'ElectoralRollCertificateReader';

export interface CertificateRoll {
  id: string;
  lastVoteRegisteredAt: Date | null;
}

// Narrow read contract for the voting certificate (TS-27). Exposes only the roll row id and
// the vote timestamp; never ballot-related columns.
export interface ElectoralRollCertificateReader {
  findCertificateRoll(electionId: string, electorId: string): Promise<CertificateRoll | null>;
}
