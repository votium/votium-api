import { Inject, Injectable } from "@nestjs/common";
import { UserNotFoundError } from "../../domain/errors/user-not-found.error";
import type { UserRepository } from "../../domain/repositories/user.repository.interface";
import { RoleName } from "../../domain/value-objects/role-name.vo";
import { USER_REPOSITORY } from "../../domain/repositories/tokens";

@Injectable()
export class UpdateUserRoleUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
  ) {}

  async execute(userId: string, role: RoleName) {
    const existing = await this.users.findById(userId);
    if (!existing) throw new UserNotFoundError(userId);
    return this.users.updateRole(userId, role);
  }
}
