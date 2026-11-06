import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import { Prisma } from '../../../../../generated/prisma/client';
import {
  DeactivateUserOutcome,
  DeleteUserOutcome,
  UserListParams,
  UserRepository,
} from '../../domain/repositories/user.repository.interface';
import { UserEntity } from '../../domain/entities/user.entity';
import { UserStatus } from '../../domain/value-objects/user-status.vo';
import { PrismaUserMapper } from '../mappers/prisma-user.mapper';

type PrismaUserWhere = {
  deleted_at?: null;
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
      where: { id, deleted_at: null },
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
      deleted_at: null,
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

  async updateStatus(id: string, status: UserStatus): Promise<UserEntity | null> {
    const { count } = await this.prisma.user.updateMany({
      where: { id, deleted_at: null },
      data: { status: status.value },
    });

    if (count === 0) return null;

    const row = await this.prisma.user.findUnique({ where: { id }, include: { role: true } });
    return row ? PrismaUserMapper.toDomain(row) : null;
  }

  async deactivate(id: string): Promise<DeactivateUserOutcome> {
    try {
      return await this.runDeactivate(id);
    } catch (error) {
      if (isSerializationError(error)) return this.runDeactivate(id);
      throw error;
    }
  }

  async softDelete(id: string): Promise<DeleteUserOutcome> {
    try {
      return await this.runSoftDelete(id);
    } catch (error) {
      if (isSerializationError(error)) return this.runSoftDelete(id);
      throw error;
    }
  }

  private async runDeactivate(id: string): Promise<DeactivateUserOutcome> {
    return this.prisma.$transaction(
      async (tx) => {
        const row = await tx.user.findUnique({ where: { id }, include: { role: true } });
        if (!row) return { outcome: 'not_found' as const };

        const entity = PrismaUserMapper.toDomain(row);
        if (entity.isDeleted()) return { outcome: 'not_found' as const };
        if (entity.isDisabled()) return { outcome: 'already_disabled' as const };

        if (entity.isAuditor() && entity.isActive() && (await this.isLastActiveAuditor(tx, id))) {
          return { outcome: 'last_auditor' as const };
        }

        const updated = await tx.user.update({
          where: { id },
          data: { status: 'DISABLED' },
          include: { role: true },
        });
        return { outcome: 'deactivated' as const, user: PrismaUserMapper.toDomain(updated) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async runSoftDelete(id: string): Promise<DeleteUserOutcome> {
    return this.prisma.$transaction(
      async (tx) => {
        const row = await tx.user.findUnique({ where: { id }, include: { role: true } });
        if (!row) return { outcome: 'not_found' as const };

        const entity = PrismaUserMapper.toDomain(row);
        if (entity.isDeleted()) return { outcome: 'already_deleted' as const };

        if (entity.isAuditor() && entity.isActive() && (await this.isLastActiveAuditor(tx, id))) {
          return { outcome: 'last_auditor' as const };
        }

        const updated = await tx.user.update({
          where: { id },
          data: { deleted_at: new Date() },
          include: { role: true },
        });
        return { outcome: 'deleted' as const, user: PrismaUserMapper.toDomain(updated) };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private async isLastActiveAuditor(
    tx: Prisma.TransactionClient,
    excludeId: string,
  ): Promise<boolean> {
    const others = await tx.user.count({
      where: {
        role: { name: 'AUDITOR' },
        status: 'ACTIVE',
        deleted_at: null,
        id: { not: excludeId },
      },
    });
    return others === 0;
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isSerializationError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2034'
  );
}
