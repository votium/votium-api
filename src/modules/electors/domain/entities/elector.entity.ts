export interface CreateElectorInput {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  studentCode: string;
  programCode: string;
  status?: string;
}

export interface RestoreElectorInput {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  studentCode: string;
  programCode: string;
  status: string;
  createdAt: Date;
}

export class ElectorEntity {
  static readonly DEFAULT_STATUS = 'ACTIVE';

  private constructor(
    public readonly id: string | null,
    public readonly firstName: string,
    public readonly lastName: string,
    public readonly email: string,
    public readonly passwordHash: string,
    public readonly studentCode: string,
    public readonly programCode: string,
    public readonly status: string,
    public readonly createdAt: Date | null,
  ) {}

  static create(input: CreateElectorInput): ElectorEntity {
    return new ElectorEntity(
      null,
      input.firstName.trim(),
      input.lastName.trim(),
      input.email.trim(),
      input.passwordHash,
      input.studentCode.trim(),
      input.programCode.trim(),
      input.status ?? ElectorEntity.DEFAULT_STATUS,
      null,
    );
  }

  static restore(input: RestoreElectorInput): ElectorEntity {
    return new ElectorEntity(
      input.id,
      input.firstName,
      input.lastName,
      input.email,
      input.passwordHash,
      input.studentCode,
      input.programCode,
      input.status,
      input.createdAt,
    );
  }

  static buildTemporaryPassword(firstName: string, lastName: string, studentCode: string): string {
    const givenName = firstToken(firstName);
    const surname = firstToken(lastName);
    const code = studentCode.trim();

    return `${namePrefix(givenName)}${code}${namePrefix(surname)}`;
  }
}

function firstToken(value: string): string {
  const trimmed = value.trim();
  return trimmed.split(/\s+/)[0] ?? '';
}

function namePrefix(token: string): string {
  return normalizeAccents(token).toUpperCase().slice(0, 2);
}

function normalizeAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
