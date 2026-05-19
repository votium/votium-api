import { UserEntity } from '../entities/user.entity';
import { RoleName } from '../value-objects/role-name.vo';

export interface UserRepository {
  findById(id: string): Promise<UserEntity | null>;
  findByEmail(email: string): Promise<UserEntity | null>;
  findAllActive(): Promise<UserEntity[]>;
  updateRole(userId: string, role: RoleName): Promise<UserEntity>;
  create(input: {
    name: string;
    email: string;
    passwordHash: string;
    role: RoleName;
  }): Promise<UserEntity>;
}
