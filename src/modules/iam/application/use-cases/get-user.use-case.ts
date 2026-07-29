import { UserNotFoundError } from '../../domain/errors/user-not-found.error';
import type { UserRepository } from '../../domain/repositories/user.repository.interface';

export class GetUserUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(id: string) {
    const user = await this.users.findById(id);
    if (!user) throw new UserNotFoundError(id);
    return user;
  }
}
