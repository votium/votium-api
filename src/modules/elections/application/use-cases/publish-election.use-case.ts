import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectionEntity } from '../../domain/entities/election.entity';
import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import { ElectionStatusTransitionError } from '../../domain/errors/election-status-transition.error';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';
import { ElectionLedgerPort } from '../ports/election-ledger.port';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { ElectionPublishedEvent } from '../events/election-published.event';
import { ElectionAuditPort } from '../ports/election-audit.port';

export class PublishElectionUseCase {
  private auditLog: { id: number } = { id: 0 };

  constructor(
    private readonly elections: Pick<ElectionRepository, 'findById' | 'updateStatus'>,
    private readonly audit: AuditLogPort,
    private readonly ledger: ElectionLedgerPort,
    private readonly events: Pick<EventEmitter2, 'emit'>,
    private readonly auditPort: ElectionAuditPort,
  ) {}

  async execute(input: { electionId: string; requestingUserId: string }): Promise<ElectionEntity> {
    const { electionId, requestingUserId } = input;

    const election = await this.elections.findById(electionId);
    if (!election) throw new ElectionNotFoundError(electionId);

    if (election.currentStatus !== 'CLOSED') {
      throw new ElectionStatusTransitionError(election.currentStatus, 'PUBLISHED');
    }

    await this.audit.log('ELECTION_STATUS_CHANGED', requestingUserId, {
      electionId,
      newStatus: 'PUBLISHED',
    });

    try {
      this.auditLog = await this.auditPort.recordBlockchainAction({
        actorId: requestingUserId,
        actionType: 'PUBLISH_ELECTION',
        electionId: electionId,
        status: 'PENDING',
        summary: `Publicando la elección con ID ${electionId} en Hyperledger Fabric`,
        transactions: [],
      });
      const ledgerResponse = await this._updateLedger(electionId);

      await this.auditPort.updateBlockchainActionStatus(this.auditLog.id, 'SUCCESS', [
        {
          step: 'PUBLISH_ELECTION',
          txId: ledgerResponse.txId,
          status: 'SUCCESS',
          blockNumber: ledgerResponse.blockNumber,
        },
      ]);
    } catch {
      await this.auditPort.updateBlockchainActionStatus(this.auditLog.id, 'FAILED', [
        {
          step: 'PUBLISH_ELECTION',
          txId: '',
          status: 'FAILED',
          blockNumber: 0,
          errorMessage: `Ocurrió un error al publicar la elección con ID ${electionId} en Hyperledger Fabric`,
        },
      ]);
      throw new Error(`Failed to publish election with ID ${electionId} on the Hyperledger Fabric`);
    }

    const updated = await this.elections.updateStatus(
      electionId,
      'PUBLISHED',
      requestingUserId,
      'CLOSED',
    );

    if (!updated) {
      throw new ElectionStatusTransitionError('CLOSED', 'PUBLISHED');
    }

    this.events.emit(
      'election.published',
      new ElectionPublishedEvent(electionId, requestingUserId),
    );

    return updated;
  }

  _updateLedger(electionId: string) {
    return this.ledger.publish(electionId);
  }
}
