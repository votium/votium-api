import { UserNotFoundError } from 'src/modules/iam/domain/errors/user-not-found.error';
import type { UserRepository } from 'src/modules/iam/domain/repositories/user.repository.interface';

export class GetMeUserUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(id: string) {
    const user = await this.users.findById(id);
    if (!user) throw new UserNotFoundError(id);
    return user;
  }
}
