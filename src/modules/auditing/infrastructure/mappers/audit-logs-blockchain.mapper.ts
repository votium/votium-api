import { AuditLogsBlockchainEntity } from '../../domain/entities/audit-logs-blockchain.entity';
import { AuditLogsBlockchainStatusType } from '../../domain/value-objects/audit-logs-blockchain-status.vo';
import { Prisma } from '../../../../../generated/prisma/client';

export interface AuditLogsBlockchainRow {
  id: bigint;
  actor_id: string;
  action_type: string;
  entity_type: string;
  entity_id: string;
  status: AuditLogsBlockchainStatusType;
  details: Prisma.JsonValue;
  created_at: Date;
}

export class AuditLogsBlockchainMapper {
  static toDomainEntity(input: AuditLogsBlockchainRow): AuditLogsBlockchainEntity {
    return AuditLogsBlockchainEntity.restore({
      id: Number(input.id),
      actorId: input.actor_id,
      actionType: input.action_type,
      entityType: input.entity_type,
      entityId: input.entity_id,
      status: input.status,
      details: input.details as Record<string, unknown>,
      createdAt: input.created_at,
    });
  }
}
