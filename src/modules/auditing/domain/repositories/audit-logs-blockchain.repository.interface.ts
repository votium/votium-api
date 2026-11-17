import { AuditLogsBlockchainEntity } from '../entities/audit-logs-blockchain.entity';
import { AuditLogsBlockchainStatusType } from '../value-objects/audit-logs-blockchain-status.vo';

export const AUDIT_LOGS_BLOCKCHAIN_REPOSITORY = Symbol('AUDIT_LOGS_BLOCKCHAIN_REPOSITORY');

export interface ListParams {
  page: number;
  limit: number;
  status?: AuditLogsBlockchainStatusType;
  actorId?: string;
  actionType?: string;
  entityType?: string;
  entityId?: string;
}

export interface AuditLogsBlockchainRepository {
  save(entity: AuditLogsBlockchainEntity): Promise<AuditLogsBlockchainEntity>;
  findById(id: number): Promise<AuditLogsBlockchainEntity | null>;
  updateStatus(
    id: number,
    newStatus: AuditLogsBlockchainStatusType,
    transactions?: Record<string, unknown>[],
  ): Promise<AuditLogsBlockchainEntity | null>;
  findByTxHash(txHash: string): Promise<AuditLogsBlockchainEntity | null>;
  findAll(params: ListParams): Promise<AuditLogsBlockchainEntity[]>;
}
