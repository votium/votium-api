export const AUDIT_LOG_REPOSITORY = 'AuditLogRepository';

export type AuditLogRecord = {
  id: string;
  userId: string; // mapped from user_id
  action: string;
  reason: string | null;
  details: string | null; // raw JSON string, preserved verbatim
  timestamp: Date;
};

export type AuditLogListParams = {
  page: number;
  limit: number;
  userId?: string;
  startDate?: Date; // inclusive lower bound (UTC start-of-day)
  endDate?: Date; // inclusive upper bound (UTC end-of-day)
};

export type AuditLogListResult = {
  logs: AuditLogRecord[];
  total: number;
};

export interface AuditLogRepository {
  // One count + one findMany sharing the SAME where; ordered timestamp DESC with a
  // deterministic id tie-breaker; the count does not apply skip/take. Filtering and
  // pagination happen at the database level.
  findAll(params: AuditLogListParams): Promise<AuditLogListResult>;
}
