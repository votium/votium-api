export class UserStatus {
  private constructor(private readonly _value: string) {}

  static readonly ACTIVE = new UserStatus('ACTIVE');
  static readonly DISABLED = new UserStatus('DISABLED');

  static from(value: string): UserStatus {
    switch (value) {
      case 'ACTIVE':
        return UserStatus.ACTIVE;
      case 'DISABLED':
        return UserStatus.DISABLED;
      default:
        throw new Error(`Invalid UserStatus: ${value}`);
    }
  }

  get value(): string {
    return this._value;
  }

  toString(): string {
    return this._value;
  }

  equals(other: UserStatus): boolean {
    return this._value === other._value;
  }
}
