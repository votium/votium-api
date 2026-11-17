export const AUDIT_LOGS_BLOCKCHAIN_STATUS_VALUES = [
  'PENDING',
  'SUCCESS',
  'FAILED',
  'PARTIAL_SUCCESS',
  'COMPENSATED',
] as const;

export type AuditLogsBlockchainStatusType = (typeof AUDIT_LOGS_BLOCKCHAIN_STATUS_VALUES)[number];

export class AuditLogsBlockchainStatus {
  private readonly _value: AuditLogsBlockchainStatusType;

  constructor(value: string) {
    this.ensureIsValidStatus(value);
    this._value = value as AuditLogsBlockchainStatusType;
  }

  get value(): AuditLogsBlockchainStatusType {
    return this._value;
  }

  private ensureIsValidStatus(value: string): void {
    if (!AUDIT_LOGS_BLOCKCHAIN_STATUS_VALUES.includes(value as AuditLogsBlockchainStatusType)) {
      throw new Error(
        `<${value}> no es un estado de elección válido. Estados permitidos: ${AUDIT_LOGS_BLOCKCHAIN_STATUS_VALUES.join(', ')}`,
      );
    }
  }

  public equals(other: AuditLogsBlockchainStatus): boolean {
    return this._value === other.value;
  }

  public toString(): string {
    return this._value;
  }

  public isPending(): boolean {
    return this._value === 'PENDING';
  }

  public isSuccess(): boolean {
    return this._value === 'SUCCESS';
  }

  public isFailed(): boolean {
    return this._value === 'FAILED';
  }

  public isPartialSuccess(): boolean {
    return this._value === 'PARTIAL_SUCCESS';
  }

  public isCompensated(): boolean {
    return this._value === 'COMPENSATED';
  }
}
