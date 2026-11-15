export const PASSWORD_RECOVERY_EMAIL_PORT = 'PasswordRecoveryEmailPort';

// Dedicated port so EmailServicePort (implemented by many test fakes) stays unchanged.
export interface PasswordRecoveryEmailPort {
  sendPasswordRecoveryCode(to: string, code: string): Promise<void>;
}
