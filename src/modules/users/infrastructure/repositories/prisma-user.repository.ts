import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import { UserRepository } from '../../domain/repositories/user.repository.interface';
import { UserEntity } from '../../domain/entities/user.entity';
import { RoleName } from '../../domain/value-objects/role-name.vo';
import { PrismaUserMapper } from '../mappers/prisma-user.mapper';
import { RoleNotFoundError } from '../../domain/errors/role-not-found.error';

@Injectable()
export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserEntity | null> {
    const row = await this.prisma.user.findUnique({
      where: { id },
      include: { role: true },
    });
    return row ? PrismaUserMapper.toDomain(row) : null;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const row = await this.prisma.user.findUnique({
      where: { email },
      include: { role: true },
    });
    return row ? PrismaUserMapper.toDomain(row) : null;
  }

  async create(input: {
    name: string;
    email: string;
    passwordHash: string;
    role: RoleName;
  }): Promise<UserEntity> {
    const role = await this.prisma.role.findUnique({
      where: { name: input.role },
      select: { id: true },
    });
    if (!role) throw new RoleNotFoundError(input.role);

    const row = await this.prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        password_hash: input.passwordHash,
        role_id: role.id,
      },
      include: { role: true },
    });
    return PrismaUserMapper.toDomain(row);
  }

  async updateRole(userId: string, role: RoleName): Promise<UserEntity> {
    const roleRow = await this.prisma.role.findUnique({
      where: { name: role },
      select: { id: true },
    });
    if (!roleRow) throw new RoleNotFoundError(role);

    const row = await this.prisma.user.update({
      where: { id: userId },
      data: { role_id: roleRow.id },
      include: { role: true },
    });
    return PrismaUserMapper.toDomain(row);
  }
}
