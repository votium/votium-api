import { Module, OnModuleInit, forwardRef } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import { IAM_GATEWAY } from 'src/modules/auth/application/ports/iam.gateway.port';
import { PrismaIamGateway } from './infrastructure/gateways/prisma-iam.gateway';
import { EnsureDefaultRolesUseCase } from './application/use-cases/ensure-default-roles.use-case';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { AuthModule } from 'src/modules/auth/auth.module';
import { UsersController } from './presentation/controllers/users.controller';
import { PrismaUserRepository } from './infrastructure/repositories/prisma-user.repository';
import { PrismaRoleRepository } from './infrastructure/repositories/prisma-role.repository';
import {
  USER_REPOSITORY,
  type UserRepository,
} from './domain/repositories/user.repository.interface';
import {
  ROLE_REPOSITORY,
  type RoleRepository,
} from './domain/repositories/role.repository.interface';
import { AUDIT_LOG_PORT, type AuditLogPort } from './application/ports/audit-log.port';
import {
  PASSWORD_HASHER_PORT,
  type PasswordHasherPort,
} from './application/ports/password-hasher.port';
import { NodeCryptoPasswordHasherService } from './infrastructure/services/node-crypto-password-hasher.service';
import { PrismaAuditLogService } from './infrastructure/services/prisma-audit-log.service';
import { GetUsersUseCase } from './application/use-cases/get-users.use-case';
import { GetUserUseCase } from './application/use-cases/get-user.use-case';
import { DisableUserUseCase } from './application/use-cases/disable-user.use-case';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [UsersController],
  providers: [
    PrismaService,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: ROLE_REPOSITORY, useClass: PrismaRoleRepository },
    { provide: PASSWORD_HASHER_PORT, useClass: NodeCryptoPasswordHasherService },
    { provide: AUDIT_LOG_PORT, useClass: PrismaAuditLogService },
    { provide: IAM_GATEWAY, useClass: PrismaIamGateway },
    {
      provide: EnsureDefaultRolesUseCase,
      useFactory: (roles: RoleRepository) => new EnsureDefaultRolesUseCase(roles),
      inject: [ROLE_REPOSITORY],
    },
    {
      provide: CreateUserUseCase,
      useFactory: (
        users: UserRepository,
        roles: RoleRepository,
        hasher: PasswordHasherPort,
        audit: AuditLogPort,
      ) => new CreateUserUseCase(users, roles, hasher, audit),
      inject: [USER_REPOSITORY, ROLE_REPOSITORY, PASSWORD_HASHER_PORT, AUDIT_LOG_PORT],
    },
    {
      provide: GetUsersUseCase,
      useFactory: (users: UserRepository) => new GetUsersUseCase(users),
      inject: [USER_REPOSITORY],
    },
    {
      provide: GetUserUseCase,
      useFactory: (users: UserRepository) => new GetUserUseCase(users),
      inject: [USER_REPOSITORY],
    },
    {
      provide: DisableUserUseCase,
      useFactory: (users: UserRepository, audit: AuditLogPort) =>
        new DisableUserUseCase(users, audit),
      inject: [USER_REPOSITORY, AUDIT_LOG_PORT],
    },
  ],
  exports: [
    EnsureDefaultRolesUseCase,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: PASSWORD_HASHER_PORT, useClass: NodeCryptoPasswordHasherService },
    { provide: IAM_GATEWAY, useClass: PrismaIamGateway },
  ],
})
export class IamModule implements OnModuleInit {
  constructor(private readonly ensureDefaultRoles: EnsureDefaultRolesUseCase) {}

  async onModuleInit() {
    await this.ensureDefaultRoles.execute();
  }
}
