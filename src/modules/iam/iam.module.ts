import { Module, OnModuleInit } from '@nestjs/common';
import { PrismaService } from 'src/shared/database/prisma.service';
import { IAM_GATEWAY } from 'src/modules/auth/application/ports/iam.gateway.port';
import { PrismaIamGateway } from './infrastructure/gateways/prisma-iam.gateway';
import { EnsureDefaultRolesUseCase } from './application/use-cases/ensure-default-roles.use-case';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case';
import { UsersController } from './presentation/controllers/users.controller';
import { PrismaUserRepository } from './infrastructure/repositories/prisma-user.repository';
import { PrismaRoleRepository } from './infrastructure/repositories/prisma-role.repository';
import { ROLE_REPOSITORY, USER_REPOSITORY } from './domain/repositories/tokens';
import { AUDIT_LOG_PORT } from './application/ports/audit-log.port';
import { PASSWORD_HASHER_PORT } from './application/ports/password-hasher.port';
import { NodeCryptoPasswordHasherService } from './infrastructure/services/node-crypto-password-hasher.service';
import { PrismaAuditLogService } from './infrastructure/services/prisma-audit-log.service';
import { GetUsersUseCase } from './application/use-cases/get-users.use-case';
import { GetUserUseCase } from './application/use-cases/get-user.use-case';
import { DisableUserUseCase } from './application/use-cases/disable-user.use-case';

@Module({
  controllers: [UsersController],
  providers: [
    PrismaService,
    EnsureDefaultRolesUseCase,
    CreateUserUseCase,
    GetUsersUseCase,
    GetUserUseCase,
    DisableUserUseCase,
    { provide: USER_REPOSITORY, useClass: PrismaUserRepository },
    { provide: ROLE_REPOSITORY, useClass: PrismaRoleRepository },
    { provide: PASSWORD_HASHER_PORT, useClass: NodeCryptoPasswordHasherService },
    { provide: AUDIT_LOG_PORT, useClass: PrismaAuditLogService },
    { provide: IAM_GATEWAY, useClass: PrismaIamGateway },
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
