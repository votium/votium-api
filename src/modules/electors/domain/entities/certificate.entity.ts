export interface CreateCertificateInput {
  electoralRollId: string;
  electionId: string;
  verificationCode: string;
}

export interface RestoreCertificateInput extends CreateCertificateInput {
  id: string;
  createdAt: Date;
}

export class CertificateEntity {
  private constructor(
    public readonly id: string | null,
    public readonly electoralRollId: string,
    public readonly electionId: string,
    public readonly verificationCode: string,
    public readonly createdAt: Date | null,
  ) {}

  static create(input: CreateCertificateInput): CertificateEntity {
    return new CertificateEntity(
      null,
      input.electoralRollId,
      input.electionId,
      input.verificationCode,
      null,
    );
  }

  static restore(input: RestoreCertificateInput): CertificateEntity {
    return new CertificateEntity(
      input.id,
      input.electoralRollId,
      input.electionId,
      input.verificationCode,
      input.createdAt,
    );
  }
}
