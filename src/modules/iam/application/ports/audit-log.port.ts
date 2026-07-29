export const AUDIT_LOG_PORT = 'AuditLogPort';

export interface AuditLogPort {
  log(action: string, userId: string, details?: Record<string, unknown>): Promise<void>;
}
