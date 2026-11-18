import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { Prisma } from '../../../../../generated/prisma/client';

import {
  ListParams,
  type AuditLogsBlockchainRepository,
} from '../../domain/repositories/audit-logs-blockchain.repository.interface';
import { AuditLogsBlockchainEntity } from '../../domain/entities/audit-logs-blockchain.entity';
import { AuditLogsBlockchainStatusType } from '../../domain/value-objects/audit-logs-blockchain-status.vo';
import { AuditLogsBlockchainMapper } from '../mappers/audit-logs-blockchain.mapper';

@Injectable()
export class PrismaAuditLogsBlockchainRepository implements AuditLogsBlockchainRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number): Promise<AuditLogsBlockchainEntity | null> {
    const row = await this.prisma.auditLogsBlockchain.findUnique({
      where: { id },
    });

    if (!row) {
      return null;
    }

    return AuditLogsBlockchainMapper.toDomainEntity(row);
  }

  async updateStatus(
    id: number,
    newStatus: AuditLogsBlockchainStatusType,
    transactions: Record<string, unknown>[] = [],
  ): Promise<AuditLogsBlockchainEntity | null> {
    const transactionsJson = JSON.stringify(transactions);

    const updatedRow = await this.prisma.$transaction(async (tx) => {
      const affected = await tx.$executeRaw`
        UPDATE audit_logs_blockchain
        SET status = CAST(${newStatus} AS "AuditLogsBlockchainStatus"),
            details = jsonb_set(
              COALESCE(details, '{}'::jsonb),
              '{transactions}',
              COALESCE(
                CASE
                  WHEN jsonb_typeof(details->'transactions') = 'array'
                    THEN details->'transactions'
                  WHEN jsonb_typeof(details->'transactions'->'transactions') = 'array'
                    THEN details->'transactions'->'transactions'
                  ELSE '[]'::jsonb
                END,
                '[]'::jsonb
              ) || ${transactionsJson}::jsonb,
              true
            )
        WHERE id = ${BigInt(id)}
      `;

      if (affected === 0) {
        return null;
      }

      return tx.auditLogsBlockchain.findUnique({
        where: { id: BigInt(id) },
      });
    });

    if (!updatedRow) {
      return null;
    }

    return AuditLogsBlockchainMapper.toDomainEntity(updatedRow);
  }

  async findByTxHash(txHash: string): Promise<AuditLogsBlockchainEntity | null> {
    const logByTx = await this.prisma.auditLogsBlockchain.findFirst({
      where: {
        details: {
          path: ['transactions'],
          array_contains: [{ txId: txHash }],
        },
      },
    });

    if (!logByTx) {
      return null;
    }

    return AuditLogsBlockchainMapper.toDomainEntity(logByTx);
  }

  async findAll(params: ListParams): Promise<AuditLogsBlockchainEntity[]> {
    const { page, limit, status, actorId, actionType, entityType, entityId } = params;

    const where: Prisma.AuditLogsBlockchainWhereInput = {};

    if (status) {
      where.status = status;
    }
    if (actorId) {
      where.actor_id = actorId;
    }
    if (actionType) {
      where.action_type = actionType;
    }
    if (entityType) {
      where.entity_type = entityType;
    }
    if (entityId) {
      where.entity_id = entityId;
    }

    const rows = await this.prisma.auditLogsBlockchain.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: {
        created_at: 'desc',
      },
    });

    return rows.map((row) => AuditLogsBlockchainMapper.toDomainEntity(row));
  }

  async save(entity: AuditLogsBlockchainEntity): Promise<AuditLogsBlockchainEntity> {
    const createdEntity = await this.prisma.auditLogsBlockchain.create({
      data: {
        actor_id: entity.actorId,
        action_type: entity.actionType,
        entity_type: entity.entityType,
        entity_id: entity.entityId,
        status: entity.status,
        details: entity.details as Prisma.InputJsonValue,
      },
    });

    return AuditLogsBlockchainMapper.toDomainEntity(createdEntity);
  }
}
