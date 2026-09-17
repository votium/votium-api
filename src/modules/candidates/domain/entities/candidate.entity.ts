import { CandidateCompanionIncompleteError } from '../errors/candidate-companion-incomplete.error';
import type { UpdateCandidateInput } from './update-candidate-input';

export interface CreateCandidateInput {
  firstName: string;
  lastName: string;
  studentCode: string;
  programCode: string;
  identificationNumber: string;
  status?: string;
  companionFirstName?: string | null;
  companionLastName?: string | null;
  companionStudentCode?: string | null;
  companionProgramCode?: string | null;
  companionIdentification?: string | null;
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
  deletedAt?: Date | null;
  companionFirstName: string | null;
  companionLastName: string | null;
  companionStudentCode: string | null;
  companionProgramCode: string | null;
  companionIdentification: string | null;
}

export interface CompanionFields {
  companionFirstName: string | null;
  companionLastName: string | null;
  companionStudentCode: string | null;
  companionProgramCode: string | null;
  companionIdentification: string | null;
}

export class CandidateEntity {
  static readonly DEFAULT_STATUS = 'ACTIVE';
  static readonly INACTIVE_STATUS = 'INACTIVE';
  private static readonly COMPANION_FIELDS: Array<
    keyof CreateCandidateInput & keyof CompanionFields
  > = [
    'companionFirstName',
    'companionLastName',
    'companionStudentCode',
    'companionProgramCode',
    'companionIdentification',
  ];

  private constructor(
    public readonly id: string | null,
    public firstName: string,
    public lastName: string,
    public readonly studentCode: string,
    public programCode: string,
    public identificationNumber: string,
    private _status: string,
    private _deletedAt: Date | null,
    public readonly createdAt: Date | null,
    public companionFirstName: string | null,
    public companionLastName: string | null,
    public companionStudentCode: string | null,
    public companionProgramCode: string | null,
    public companionIdentification: string | null,
  ) {}

  static create(input: CreateCandidateInput): CandidateEntity {
    const companion = CandidateEntity.normalizeCompanion(input);

    return new CandidateEntity(
      null,
      input.firstName.trim(),
      input.lastName.trim(),
      input.studentCode.trim(),
      input.programCode.trim(),
      input.identificationNumber.trim(),
      input.status ?? CandidateEntity.DEFAULT_STATUS,
      null,
      null,
      companion.companionFirstName,
      companion.companionLastName,
      companion.companionStudentCode,
      companion.companionProgramCode,
      companion.companionIdentification,
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
      input.deletedAt ?? null,
      input.createdAt,
      input.companionFirstName,
      input.companionLastName,
      input.companionStudentCode,
      input.companionProgramCode,
      input.companionIdentification,
    );
  }

  get status(): string {
    return this._status;
  }

  get deletedAt(): Date | null {
    return this._deletedAt;
  }

  isDeleted(): boolean {
    return this._deletedAt !== null;
  }

  delete(now: Date = new Date()): void {
    this._deletedAt = now;
  }

  deactivate(): void {
    this._status = CandidateEntity.INACTIVE_STATUS;
  }

  reactivate(): void {
    this._status = CandidateEntity.DEFAULT_STATUS;
  }

  update(input: UpdateCandidateInput): void {
    if (input.firstName != null) this.firstName = input.firstName.trim();
    if (input.lastName != null) this.lastName = input.lastName.trim();
    if (input.programCode != null) this.programCode = input.programCode.trim();
    if (input.identificationNumber != null) {
      this.identificationNumber = input.identificationNumber.trim();
    }
    if (input.companionFirstName != null) {
      this.companionFirstName = input.companionFirstName.trim();
    }
    if (input.companionLastName != null) {
      this.companionLastName = input.companionLastName.trim();
    }
    if (input.companionStudentCode != null) {
      this.companionStudentCode = input.companionStudentCode.trim();
    }
    if (input.companionProgramCode != null) {
      this.companionProgramCode = input.companionProgramCode.trim();
    }
    if (input.companionIdentification != null) {
      this.companionIdentification = input.companionIdentification.trim();
    }
  }

  private static normalizeCompanion(input: CreateCandidateInput): CompanionFields {
    const companionValues = CandidateEntity.COMPANION_FIELDS.map((field) => input[field]);
    const providedCount = companionValues.filter((value) => value != null).length;

    if (providedCount === 0) {
      return {
        companionFirstName: null,
        companionLastName: null,
        companionStudentCode: null,
        companionProgramCode: null,
        companionIdentification: null,
      };
    }

    if (providedCount !== CandidateEntity.COMPANION_FIELDS.length) {
      throw new CandidateCompanionIncompleteError();
    }

    return {
      companionFirstName: input.companionFirstName!.trim(),
      companionLastName: input.companionLastName!.trim(),
      companionStudentCode: input.companionStudentCode!.trim(),
      companionProgramCode: input.companionProgramCode!.trim(),
      companionIdentification: input.companionIdentification!.trim(),
    };
  }
}
