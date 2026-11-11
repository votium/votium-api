import { BadRequestException } from 'src/shared/exceptions/base/bad-request.exception';

// Parses a "YYYY-MM-DD" audit-log date into its inclusive UTC day bounds, rejecting
// malformed or impossible calendar dates (e.g. 2026-02-30). The audit_logs.timestamp
// column is a DateTime, so both bounds are expressed in UTC.

export function parseAuditLogDate(dateStr: string): { startOfDay: Date; endOfDay: Date } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const startOfDay = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));

  if (
    startOfDay.getUTCFullYear() !== y ||
    startOfDay.getUTCMonth() !== m - 1 ||
    startOfDay.getUTCDate() !== d
  ) {
    throw new BadRequestException(`Invalid calendar date: ${dateStr}`, 'AUDIT_LOG_INVALID_DATE');
  }

  const endOfDay = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
  return { startOfDay, endOfDay };
}
