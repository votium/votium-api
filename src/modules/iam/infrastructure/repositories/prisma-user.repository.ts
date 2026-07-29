import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import {
  UserListParams,
  UserRepository,
} from '../../domain/repositories/user.repository.interface';
import { UserEntity } from '../../domain/entities/user.entity';
import { PrismaUserMapper } from '../mappers/prisma-user.mapper';

type PrismaUserWhere = {
  status?: string;
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

  async save(entity: UserEntity): Promise<UserEntity> {
    const exists = await this.prisma.user.findUnique({ where: { id: entity.id } });

    if (exists) {
      const row = await this.prisma.user.update({
        where: { id: entity.id },
        data: {
          first_name: entity.firstName,
          last_name: entity.lastName,
          email: entity.email,
          password_hash: entity.passwordHash,
          role_id: entity.roleId,
          status: entity.status.value,
          updated_at: entity.updatedAt,
        },
        include: { role: true },
      });
      return PrismaUserMapper.toDomain(row);
    }

    const row = await this.prisma.user.create({
      data: {
        id: entity.id,
        first_name: entity.firstName,
        last_name: entity.lastName,
        email: entity.email,
        password_hash: entity.passwordHash,
        role_id: entity.roleId,
        status: entity.status.value,
        created_at: entity.createdAt,
        updated_at: entity.updatedAt,
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
      ...(params.status ? { status: params.status.value } : {}),
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
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
