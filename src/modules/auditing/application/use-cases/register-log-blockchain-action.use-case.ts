import { Inject, Injectable, Logger } from '@nestjs/common';
import { RegisterLogBlockchainActionDto } from '../dtos/register-log-blockchain-action.dto';
import {
  AUDIT_LOGS_BLOCKCHAIN_REPOSITORY,
  type AuditLogsBlockchainRepository,
} from '../../domain/repositories/audit-logs-blockchain.repository.interface';

@Injectable()
export class RegisterLogBlockchainActionUseCase {
  private readonly logger = new Logger(RegisterLogBlockchainActionUseCase.name);

  constructor(
    @Inject(AUDIT_LOGS_BLOCKCHAIN_REPOSITORY)
    private readonly auditLogsBlockchainRepository: AuditLogsBlockchainRepository,
  ) {}

  async execute(input: RegisterLogBlockchainActionDto): Promise<{ id: number }> {
    try {
      const audit = await this.auditLogsBlockchainRepository.save({
        id: null,
        actorId: input.actorId,
        actionType: input.actionType,
        entityType: input.entityType,
        entityId: input.entityId,
        status: input.status,
        details: input.details,
        createdAt: null,
      });

      return { id: audit.id ?? 0 };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error occurred while saving audit log: ${message}`);
      return { id: 0 };
    }
  }
}
