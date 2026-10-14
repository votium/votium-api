export const EMAIL_SERVICE_PORT = 'EmailServicePort';

export interface EmailServicePort {
  sendVerificationCode(to: string, code: string): Promise<void>;
}
