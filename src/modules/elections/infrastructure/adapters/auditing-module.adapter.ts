// src/modules/elections/infrastructure/adapters/auditing-module.adapter.ts
import { Injectable } from '@nestjs/common';
import {
  ElectionAuditPort,
  RecordElectionBlockchainLogInput,
} from '../../application/ports/election-audit.port';

// ÚNICO lugar de elections que conoce al módulo auditing:
import {
  RegisterLogBlockchainActionUseCase,
  UpdateLogBlockchainActionUseCase,
} from '../../../auditing/application/use-cases';

@Injectable()
export class AuditingModuleAdapter implements ElectionAuditPort {
  constructor(
    private readonly registerLogBlockchainAction: RegisterLogBlockchainActionUseCase,
    private readonly updateLogBlockchainAction: UpdateLogBlockchainActionUseCase,
  ) {}

  async recordBlockchainAction(input: RecordElectionBlockchainLogInput): Promise<{ id: number }> {
    const audit = await this.registerLogBlockchainAction.execute({
      actorId: input.actorId,
      actionType: input.actionType,
      entityType: 'ELECTION',
      entityId: input.electionId,
      status: input.status,
      details: {
        summary: input.summary,
        transactions: input.transactions,
      },
    });

    return { id: audit.id };
  }

  async updateBlockchainActionStatus(
    id: number,
    newStatus: 'PENDING' | 'SUCCESS' | 'FAILED' | 'PARTIAL_SUCCESS' | 'COMPENSATED',
    transactions?: {
      step: string;
      txId: string;
      status: string;
      blockNumber: number;
      errorMessage?: string;
    }[],
  ): Promise<void> {
    if (id !== 0) {
      await this.updateLogBlockchainAction.execute({
        id,
        status: newStatus,
        transactions: transactions ?? [],
      });
    }
  }
}
