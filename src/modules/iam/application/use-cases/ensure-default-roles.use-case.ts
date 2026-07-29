import type { RoleRepository } from '../../domain/repositories/role.repository.interface';
import { RoleName } from '../../domain/value-objects/role-name.vo';

export class EnsureDefaultRolesUseCase {
  constructor(private readonly roles: RoleRepository) {}

  async execute(): Promise<void> {
    await this.roles.ensureExists(RoleName.ADMINISTRADOR);
    await this.roles.ensureExists(RoleName.AUDITOR);
  }
}
