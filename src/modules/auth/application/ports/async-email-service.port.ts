import type { EmailServicePort } from './email-service.port';

export const ASYNC_EMAIL_SERVICE_PORT = 'AsyncEmailServicePort';

export interface AsyncEmailServicePort extends EmailServicePort {
  /**
   * Hands the verification email off for background delivery and resolves
   * without waiting for the external email provider to finish.
   */
  queueVerificationCode(to: string, code: string): Promise<void>;
}
