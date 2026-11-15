import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import { Prisma } from '../../../../../generated/prisma/client';
import type {
  AuditLogListParams,
  AuditLogListResult,
  AuditLogRepository,
} from '../../domain/repositories/audit-log.repository.interface';

@Injectable()
export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: AuditLogListParams): Promise<AuditLogListResult> {
    const { page, limit, userId, startDate, endDate } = params;

    const where: Prisma.AuditLogWhereInput = {
      ...(userId ? { user_id: userId } : {}),
      ...(startDate || endDate
        ? {
            timestamp: {
              ...(startDate ? { gte: startDate } : {}),
              ...(endDate ? { lte: endDate } : {}),
            },
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        select: {
          id: true,
          user_id: true,
          action: true,
          reason: true,
          details: true,
          timestamp: true,
        },
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      logs: rows.map((row) => ({
        id: row.id,
        userId: row.user_id,
        action: row.action,
        reason: row.reason,
        details: row.details,
        timestamp: row.timestamp,
      })),
      total,
    };
  }
}
