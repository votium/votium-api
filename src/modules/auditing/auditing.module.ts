import { Module, Global } from '@nestjs/common';

import {
  RegisterLogBlockchainActionUseCase,
  UpdateLogBlockchainActionUseCase,
} from './application/use-cases';

import { AUDIT_LOGS_BLOCKCHAIN_REPOSITORY } from './domain/repositories/audit-logs-blockchain.repository.interface';
import { PrismaAuditLogsBlockchainRepository } from './infrastructure/repositories/prisma-audit-logs-blockchain.repository';

@Global()
@Module({
  providers: [
    RegisterLogBlockchainActionUseCase,
    UpdateLogBlockchainActionUseCase,
    { provide: AUDIT_LOGS_BLOCKCHAIN_REPOSITORY, useClass: PrismaAuditLogsBlockchainRepository },
  ],
  exports: [RegisterLogBlockchainActionUseCase, UpdateLogBlockchainActionUseCase],
})
export class AuditingModule {}
