import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectionEntity } from '../../domain/entities/election.entity';
import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import { ElectionStartRequiresUserError } from '../../domain/errors/election-start-requires-user.error';
import { ElectionStatusTransitionError } from '../../domain/errors/election-status-transition.error';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';
import { ElectionLedgerPort } from '../ports/election-ledger.port';
import { ElectionAuditPort } from '../ports/election-audit.port';

// Cancellation is the terminal sink of the lifecycle: any non-terminal state
// (PENDING, CREATED, ACTIVE, CLOSED) may be cancelled, and the election can never move
// out of CANCELLED again. PUBLISHED (also terminal) and CANCELLED itself are refused via
// the single domain decision point `canTransitionTo('CANCELLED')`.
export class CancelElectionUseCase {
  private auditLog: { id: number } = { id: 0 };
  constructor(
    private readonly elections: Pick<ElectionRepository, 'findById' | 'updateStatus'>,
    private readonly audit: AuditLogPort,
    private readonly ledger: ElectionLedgerPort,
    private readonly auditPort: ElectionAuditPort,
  ) {}

  async execute(input: { electionId: string; requestingUserId: string }): Promise<ElectionEntity> {
    const { electionId, requestingUserId } = input;

    if (!requestingUserId) throw new ElectionStartRequiresUserError();

    const election = await this.elections.findById(electionId);
    if (!election) throw new ElectionNotFoundError(electionId);
    if (!election.canTransitionTo('CANCELLED')) {
      throw new ElectionStatusTransitionError(election.currentStatus, 'CANCELLED');
    }

    try {
      this.auditLog = await this.auditPort.recordBlockchainAction({
        actorId: requestingUserId,
        actionType: 'CANCEL_ELECTION',
        electionId: electionId,
        status: 'PENDING',
        summary: `Cancelando la elección con ID ${electionId}`,
        transactions: [],
      });
      const ledgerResponse = await this._updateLedger(electionId);

      await this.auditPort.updateBlockchainActionStatus(this.auditLog.id, 'SUCCESS', [
        {
          step: 'CANCEL_ELECTION',
          txId: ledgerResponse.txId,
          status: 'SUCCESS',
          blockNumber: ledgerResponse.blockNumber,
        },
      ]);
    } catch {
      await this.auditPort.updateBlockchainActionStatus(this.auditLog.id, 'FAILED', [
        {
          step: 'CANCEL_ELECTION',
          txId: '',
          status: 'FAILED',
          blockNumber: 0,
          errorMessage: `Ocurrió un error al cancelar la elección con ID ${electionId} en Hyperledger Fabric`,
        },
      ]);
      throw new Error(`Failed to cancel election with ID ${electionId} on the Hyperledger Fabric`);
    }

    const updated = await this.elections.updateStatus(
      electionId,
      'CANCELLED',
      requestingUserId,
      election.currentStatus,
    );
    if (!updated) {
      throw new ElectionStatusTransitionError(election.currentStatus, 'CANCELLED');
    }

    await this.audit.log('ELECTION_STATUS_CHANGED', requestingUserId, {
      electionId,
      newStatus: 'CANCELLED',
    });

    return updated;
  }

  _updateLedger(electionId: string) {
    return this.ledger.cancel(electionId);
  }
}
