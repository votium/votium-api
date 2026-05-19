import { Module, OnModuleInit } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import { EnsureDefaultRolesUseCase } from './application/use-cases/ensure-default-roles.use-case';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { UpdateUserRoleUseCase } from './application/use-cases/update-user-role.use-case';
import { ListUsersUseCase } from './application/use-cases/list-users.use-case';
import { UsersController } from './presentation/controllers/users.controller';
import { PrismaUserRepository } from './infrastructure/repositories/prisma-user.repository';
import { PrismaRoleRepository } from './infrastructure/repositories/prisma-role.repository';
import { ROLE_REPOSITORY, USER_REPOSITORY } from './domain/repositories/tokens';
import { PASSWORD_HASHER_PORT } from './application/ports/tokens';
import { NodeCryptoPasswordHasherService } from './infrastructure/services/node-crypto-password-hasher.service';

@Module({
  controllers: [UsersController],
  providers: [
    PrismaService,
    EnsureDefaultRolesUseCase,
    CreateUserUseCase,
    UpdateUserRoleUseCase,
    ListUsersUseCase,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: ROLE_REPOSITORY, useClass: PrismaRoleRepository },
    { provide: PASSWORD_HASHER_PORT, useClass: NodeCryptoPasswordHasherService },
  ],
  exports: [
    EnsureDefaultRolesUseCase,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: PASSWORD_HASHER_PORT, useClass: NodeCryptoPasswordHasherService },
  ],
})
export class UsersModule implements OnModuleInit {
  constructor(private readonly ensureDefaultRoles: EnsureDefaultRolesUseCase) {}

  async onModuleInit() {
    await this.ensureDefaultRoles.execute();
  }
}
