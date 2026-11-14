export const ELECTION_STATUS_VALUES = [
  'PENDING',
  'CREATED',
  'ACTIVE',
  'CLOSED',
  'PUBLISHED',
  'CANCELED',
  'FINALIZING',
  'SYNC_ERROR',
] as const;

export type ElectionStatusType = (typeof ELECTION_STATUS_VALUES)[number];

export class ElectionStatus {
  private readonly _value: ElectionStatusType;

  constructor(value: string) {
    this.ensureIsValidStatus(value);
    this._value = value as ElectionStatusType;
  }

  get value(): ElectionStatusType {
    return this._value;
  }

  private ensureIsValidStatus(value: string): void {
    if (!ELECTION_STATUS_VALUES.includes(value as ElectionStatusType)) {
      throw new Error(
        `<${value}> no es un estado de elección válido. Estados permitidos: ${ELECTION_STATUS_VALUES.join(', ')}`,
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
  public isPending(): boolean {
    return this._value === 'PENDING';
  }

  public isActive(): boolean {
    return this._value === 'ACTIVE';
  }

  public isClosed(): boolean {
    return this._value === 'CLOSED';
  }

  public isPublished(): boolean {
    return this._value === 'PUBLISHED';
  }

  public isCanceled(): boolean {
    return this._value === 'CANCELED';
  }

  public isFinalizing(): boolean {
    return this._value === 'FINALIZING';
  }

  public isSyncError(): boolean {
    return this._value === 'SYNC_ERROR';
  }
}
