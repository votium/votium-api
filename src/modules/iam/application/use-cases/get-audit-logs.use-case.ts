import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';
import type {
  AuditLogRecord,
  AuditLogRepository,
} from '../../domain/repositories/audit-log.repository.interface';
import { parseAuditLogDate } from '../audit-log-date.util';

export type GetAuditLogsInput = {
  page: number;
  limit: number;
  userId?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
};

export type GetAuditLogsResult = {
  logs: AuditLogRecord[];
  total: number;
};

export class GetAuditLogsUseCase {
  constructor(private readonly auditLogs: AuditLogRepository) {}

  async execute(params: GetAuditLogsInput): Promise<GetAuditLogsResult> {
    const page = Number.isFinite(params.page) && params.page > 0 ? params.page : 1;
    const limit = Number.isFinite(params.limit) && params.limit > 0 ? params.limit : 10;

    const start = params.startDate ? parseAuditLogDate(params.startDate) : undefined;
    const end = params.endDate ? parseAuditLogDate(params.endDate) : undefined;

    if (start && end && start.startOfDay > end.endOfDay) {
      throw new BadRequestException(
        'startDate must be on or before endDate.',
        'AUDIT_LOG_INVALID_DATE_RANGE',
      );
    }

    return this.auditLogs.findAll({
      page,
      limit,
      userId: params.userId,
      startDate: start?.startOfDay,
      endDate: end?.endOfDay,
    });
  }
}
