import { UserEntity } from '../entities/user.entity';
import { UserStatus } from '../value-objects/user-status.vo';

export const USER_REPOSITORY = 'USER_REPOSITORY';

export interface UserRepository {
  findById(id: string): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;

  save(entity: UserEntity): Promise<UserEntity>;

  findAll(params: UserListParams): Promise<{ users: UserEntity[]; total: number }>;
}

export interface UserListParams {
  page: number;
  limit: number;
  search?: string;
  role?: string;
  status?: UserStatus;
}
