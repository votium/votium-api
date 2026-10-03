export const MFA_HASHER_PORT = 'MfaHasherPort';

export interface MfaHasherPort {
  hash(code: string): Promise<string>;
  verify(code: string, hash: string): Promise<boolean>;
}
