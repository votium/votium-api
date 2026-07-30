export const PASSWORD_HASHER_PORT = 'PasswordHasherPort';

export interface PasswordHasherPort {
  hash(password: string): Promise<string>;
  verify(password: string, passwordHash: string): Promise<boolean>;
}
