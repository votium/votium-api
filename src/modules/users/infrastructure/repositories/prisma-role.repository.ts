import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/shared/database/prisma.service";
import { RoleRepository } from "../../domain/repositories/role.repository.interface";
import { RoleName } from "../../domain/value-objects/role-name.vo";
import { RoleEntity } from "../../domain/entities/role.entity";
import { PrismaRoleMapper } from "../mappers/prisma-role.mapper";

@Injectable()
export class PrismaRoleRepository implements RoleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByName(name: RoleName): Promise<RoleEntity | null> {
    const row = await this.prisma.role.findUnique({ where: { name } });
    return row ? PrismaRoleMapper.toDomain(row) : null;
  }

  async ensureExists(name: RoleName): Promise<RoleEntity> {
    const row = await this.prisma.role.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    return PrismaRoleMapper.toDomain(row);
  }
}
