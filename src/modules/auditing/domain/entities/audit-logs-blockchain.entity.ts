import { AuditLogsBlockchainStatusType } from '../value-objects/audit-logs-blockchain-status.vo';

export interface CreateAuditLogsBlockchainEntityInput {
  actorId: string;
  actionType: string;
  entityType: string;
  entityId: string;
  status: AuditLogsBlockchainStatusType;
  details: Record<string, unknown>;
}

export interface RestoreAuditLogsBlockchainEntityInput {
  id: number;
  actorId: string;
  actionType: string;
  entityType: string;
  entityId: string;
  status: AuditLogsBlockchainStatusType;
  details: Record<string, unknown>;
  createdAt: Date;
}

export class AuditLogsBlockchainEntity {
  constructor(
    public readonly id: number | null,
    public readonly actorId: string,
    public readonly actionType: string,
    public readonly entityType: string,
    public readonly entityId: string,
    public readonly status: AuditLogsBlockchainStatusType,
    public readonly details: Record<string, unknown>,
    public readonly createdAt: Date | null,
  ) {}

  static create(input: CreateAuditLogsBlockchainEntityInput) {
    return new AuditLogsBlockchainEntity(
      null,
      input.actorId,
      input.actionType,
      input.entityType,
      input.entityId,
      input.status,
      input.details,
      null,
    );
  }

  static restore(input: RestoreAuditLogsBlockchainEntityInput) {
    return new AuditLogsBlockchainEntity(
      input.id,
      input.actorId,
      input.actionType,
      input.entityType,
      input.entityId,
      input.status,
      input.details,
      input.createdAt,
    );
  }
}
