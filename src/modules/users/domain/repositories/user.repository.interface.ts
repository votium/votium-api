import { UserEntity } from '../entities/user.entity';
import { UserStatus } from '../value-objects/user-status.vo';

export interface UserRepository {
  findById(id: string): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  create(input: {
    firstName: string;
    lastName: string;
    email: string;
    passwordHash: string;
    roleId: string;
    status: UserStatus;
  }): Promise<UserEntity>;

  findAll(params: UserListParams): Promise<{ users: UserEntity[]; total: number }>;

  update(userId: string, data: Partial<UserUpdateData>): Promise<UserEntity>;
}

export interface UserListParams {
  page: number;
  limit: number;
  search?: string;
  role?: string;
  status?: UserStatus;
}

export interface UserUpdateData {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  roleId: string;
  status: UserStatus;
}
