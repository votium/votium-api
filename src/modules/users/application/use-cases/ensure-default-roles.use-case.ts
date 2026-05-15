import { Inject, Injectable } from "@nestjs/common";
import type { RoleRepository } from "../../domain/repositories/role.repository.interface";
import { ROLE_REPOSITORY } from "../../domain/repositories/tokens";
import { RoleName } from "../../domain/value-objects/role-name.vo";

@Injectable()
export class EnsureDefaultRolesUseCase {
  constructor(
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
  ) {}

  async execute(): Promise<void> {
    await this.roles.ensureExists(RoleName.ADMINISTRADOR);
    await this.roles.ensureExists(RoleName.AUDITOR);
  }
}
