export const IAM_GATEWAY = 'IAM_GATEWAY';

export interface UserCredentials {
  id: string;
  email: string;
  role: string;
}

export interface IamGateway {
  validateCredentials(email: string, password: string): Promise<UserCredentials | null>;
}
