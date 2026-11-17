import { Injectable, Logger, Inject } from '@nestjs/common';
import { UpdateLogBlockchainActionDto } from '../dtos/update-log-blockchain-action.dto';
import {
  AUDIT_LOGS_BLOCKCHAIN_REPOSITORY,
  type AuditLogsBlockchainRepository,
} from '../../domain/repositories/audit-logs-blockchain.repository.interface';

@Injectable()
export class UpdateLogBlockchainActionUseCase {
  private readonly logger = new Logger(UpdateLogBlockchainActionUseCase.name);

  constructor(
    @Inject(AUDIT_LOGS_BLOCKCHAIN_REPOSITORY)
    private readonly auditLogsBlockchainRepository: AuditLogsBlockchainRepository,
  ) {}

  async execute(input: UpdateLogBlockchainActionDto): Promise<void> {
    try {
      await this.auditLogsBlockchainRepository.updateStatus(
        input.id,
        input.status,
        input.transactions ?? [],
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error occurred while updating audit log: ${message}`);
    }
  }
}
