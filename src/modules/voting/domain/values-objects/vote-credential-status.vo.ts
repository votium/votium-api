export const VOTE_CREDENTIAL_STATUS_VALUES = ['NONE', 'MARKED', 'REJECTED', 'REPORTED'] as const;

export type VoteCredentialStatusType = (typeof VOTE_CREDENTIAL_STATUS_VALUES)[number];

export class ElectionStatus {
  private readonly _value: VoteCredentialStatusType;

  constructor(value: string) {
    this.ensureIsValidStatus(value);
    this._value = value as VoteCredentialStatusType;
  }

  get value(): VoteCredentialStatusType {
    return this._value;
  }

  private ensureIsValidStatus(value: string): void {
    if (!VOTE_CREDENTIAL_STATUS_VALUES.includes(value as VoteCredentialStatusType)) {
      throw new Error(
        `<${value}> no es un estado de credencial de voto válido. Estados permitidos: ${VOTE_CREDENTIAL_STATUS_VALUES.join(', ')}`,
      );
    }
  }

  public equals(other: ElectionStatus): boolean {
    return this._value === other.value;
  }

  public toString(): string {
    return this._value;
  }

  // Métodos de conveniencia opcionales para la lógica de dominio
  public isNone(): boolean {
    return this._value === 'NONE';
  }

  public isMarked(): boolean {
    return this._value === 'MARKED';
  }

  public isRejected(): boolean {
    return this._value === 'REJECTED';
  }

  public isReported(): boolean {
    return this._value === 'REPORTED';
  }
}
