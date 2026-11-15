import type { AuditLogRecord } from '../../domain/repositories/audit-log.repository.interface';
import { AuditLogResponseDto } from '../dtos/audit-log-response.dto';

export class AuditLogPresenter {
  static toResponse(record: AuditLogRecord): AuditLogResponseDto {
    return new AuditLogResponseDto({
      id: record.id,
      userId: record.userId,
      action: record.action,
      reason: record.reason,
      details: record.details,
      timestamp: record.timestamp.toISOString(),
    });
  }

  static toList(records: AuditLogRecord[]): AuditLogResponseDto[] {
    return records.map((record) => AuditLogPresenter.toResponse(record));
  }
}
