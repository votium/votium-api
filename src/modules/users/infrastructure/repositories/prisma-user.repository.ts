import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import {
  UserListParams,
  UserRepository,
  UserUpdateData,
} from '../../domain/repositories/user.repository.interface';
import { UserEntity } from '../../domain/entities/user.entity';
import { PrismaUserMapper } from '../mappers/prisma-user.mapper';
import { UserStatus } from '../../domain/value-objects/user-status.vo';

type PrismaUserWhere = {
  status?: UserStatus;
  role?: { name: string };
  OR?: Array<{
    first_name?: { contains: string; mode: 'insensitive' };
    last_name?: { contains: string; mode: 'insensitive' };
    email?: { contains: string; mode: 'insensitive' };
  }>;
};

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
    const normalized = normalizeEmail(email);
    const row = await this.prisma.user.findUnique({
      where: { email: normalized },
      include: { role: true },
    });
    return row ? PrismaUserMapper.toDomain(row) : null;
  }

  async create(input: {
    firstName: string;
    lastName: string;
    email: string;
    passwordHash: string;
    roleId: string;
    status: UserStatus;
  }): Promise<UserEntity> {
    const role = await this.prisma.role.findUnique({ where: { id: input.roleId } });
    if (!role) {
      // Keep error mapping minimal; application use cases validate role existence.
      throw new Error('Role not found');
    }

    const row = await this.prisma.user.create({
      data: {
        first_name: input.firstName,
        last_name: input.lastName,
        email: normalizeEmail(input.email),
        password_hash: input.passwordHash,
        role_id: input.roleId,
        status: input.status,
      },
      include: { role: true },
    });
    return PrismaUserMapper.toDomain(row);
  }

  async findAll(params: UserListParams): Promise<{ users: UserEntity[]; total: number }> {
    const page = params.page;
    const limit = params.limit;
    const skip = (page - 1) * limit;

    const search = params.search?.trim();
    const where: PrismaUserWhere = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.role ? { role: { name: params.role } } : {}),
      ...(search
        ? {
            OR: [
              { first_name: { contains: search, mode: 'insensitive' } },
              { last_name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        include: { role: true },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return { users: rows.map((row) => PrismaUserMapper.toDomain(row)), total };
  }

  async update(userId: string, data: Partial<UserUpdateData>): Promise<UserEntity> {
    const row = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(data.firstName ? { first_name: data.firstName } : {}),
        ...(data.lastName ? { last_name: data.lastName } : {}),
        ...(data.email ? { email: normalizeEmail(data.email) } : {}),
        ...(data.passwordHash ? { password_hash: data.passwordHash } : {}),
        ...(data.roleId ? { role_id: data.roleId } : {}),
        ...(data.status ? { status: data.status } : {}),
      },
      include: { role: true },
    });
    return PrismaUserMapper.toDomain(row);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
