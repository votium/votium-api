export interface CreateCandidateInput {
  firstName: string;
  lastName: string;
  studentCode: string;
  programCode: string;
  identificationNumber: string;
  status?: string;
}

export interface RestoreCandidateInput {
  id: string;
  firstName: string;
  lastName: string;
  studentCode: string;
  programCode: string;
  identificationNumber: string;
  status: string;
  createdAt: Date;
}

export class CandidateEntity {
  static readonly DEFAULT_STATUS = 'ACTIVE';

  private constructor(
    public readonly id: string | null,
    public readonly firstName: string,
    public readonly lastName: string,
    public readonly studentCode: string,
    public readonly programCode: string,
    public readonly identificationNumber: string,
    private _status: string,
    public readonly createdAt: Date | null,
  ) {}

  static create(input: CreateCandidateInput): CandidateEntity {
    return new CandidateEntity(
      null,
      input.firstName.trim(),
      input.lastName.trim(),
      input.studentCode.trim(),
      input.programCode.trim(),
      input.identificationNumber.trim(),
      input.status ?? CandidateEntity.DEFAULT_STATUS,
      null,
    );
  }

  static restore(input: RestoreCandidateInput): CandidateEntity {
    return new CandidateEntity(
      input.id,
      input.firstName,
      input.lastName,
      input.studentCode,
      input.programCode,
      input.identificationNumber,
      input.status,
      input.createdAt,
    );
  }

  get status(): string {
    return this._status;
  }
}
