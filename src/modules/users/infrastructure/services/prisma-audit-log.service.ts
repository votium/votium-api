import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import { AuditLogPort } from '../../application/ports/audit-log.port';

@Injectable()
export class PrismaAuditLogService implements AuditLogPort {
  constructor(private readonly prisma: PrismaService) {}

  async log(action: string, userId: string, details?: Record<string, unknown>): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        user_id: userId,
        action,
        details: details ? JSON.stringify(details) : null,
      },
    });
  }
}
