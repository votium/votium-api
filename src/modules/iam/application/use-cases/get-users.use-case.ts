import type { UserRepository } from '../../domain/repositories/user.repository.interface';
import { UserStatus } from '../../domain/value-objects/user-status.vo';

export class GetUsersUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(params: {
    page: number;
    limit: number;
    search?: string;
    role?: string;
    status?: string;
  }) {
    const page = Number.isFinite(params.page) && params.page > 0 ? params.page : 1;
    const limit = Number.isFinite(params.limit) && params.limit > 0 ? params.limit : 10;

    return this.users.findAll({
      page,
      limit,
      search: params.search,
      role: params.role,
      status: params.status ? UserStatus.from(params.status) : undefined,
    });
  }
}
