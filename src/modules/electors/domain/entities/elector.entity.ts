import { ElectorAlreadyInactiveError } from '../errors/elector-already-inactive.error';

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

export interface UpdateElectorInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  studentCode?: string;
  programCode?: string;
}

export class ElectorEntity {
  static readonly DEFAULT_STATUS = 'ACTIVE';
  static readonly INACTIVE_STATUS = 'INACTIVE';

  private constructor(
    public readonly id: string | null,
    public firstName: string,
    public lastName: string,
    public email: string,
    public readonly passwordHash: string,
    public studentCode: string,
    public programCode: string,
    private _status: string,
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

  get status(): string {
    return this._status;
  }

  isActive(): boolean {
    return this._status === ElectorEntity.DEFAULT_STATUS;
  }

  deactivate(): void {
    if (this._status === ElectorEntity.INACTIVE_STATUS) {
      throw new ElectorAlreadyInactiveError(this.id ?? '');
    }

    this._status = ElectorEntity.INACTIVE_STATUS;
  }

  // Merges the provided partial input into the entity. Only supplied fields
  // change; `id`, `passwordHash`, `status`, and `createdAt` are immutable.
  update(input: UpdateElectorInput): void {
    if (input.firstName !== undefined) {
      this.firstName = input.firstName.trim();
    }
    if (input.lastName !== undefined) {
      this.lastName = input.lastName.trim();
    }
    if (input.email !== undefined) {
      this.email = input.email.trim();
    }
    if (input.studentCode !== undefined) {
      this.studentCode = input.studentCode.trim();
    }
    if (input.programCode !== undefined) {
      this.programCode = input.programCode.trim();
    }
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
