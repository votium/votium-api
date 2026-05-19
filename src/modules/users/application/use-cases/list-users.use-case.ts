import { Inject, Injectable } from '@nestjs/common';
import type { UserRepository } from '../../domain/repositories/user.repository.interface';
import { USER_REPOSITORY } from '../../domain/repositories/tokens';
import { UserEntity } from '../../domain/entities/user.entity';

@Injectable()
export class ListUsersUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepository) {}

  async execute(): Promise<UserEntity[]> {
    return this.users.findAllActive();
  }
}
