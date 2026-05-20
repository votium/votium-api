export interface AuditLogPort {
  log(action: string, userId: string, details?: Record<string, unknown>): Promise<void>;
}
