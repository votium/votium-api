export class RoleName {
  private constructor(private readonly _value: string) {}

  static readonly ADMINISTRATOR = new RoleName('ADMINISTRATOR');
  static readonly AUDITOR = new RoleName('AUDITOR');

  static from(value: string): RoleName {
    switch (value) {
      case 'ADMINISTRATOR':
        return RoleName.ADMINISTRATOR;
      case 'AUDITOR':
        return RoleName.AUDITOR;
      default:
        throw new Error(`Invalid RoleName: ${value}`);
    }
  }

  get value(): string {
    return this._value;
  }

  toString(): string {
    return this._value;
  }

  equals(other: RoleName): boolean {
    return this._value === other._value;
  }
}
