import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectionEntity } from '../../domain/entities/election.entity';
import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import { ElectionNotEndedError } from '../../domain/errors/election-not-ended.error';
import { ElectionStartRequiresUserError } from '../../domain/errors/election-start-requires-user.error';
import { ElectionStatusTransitionError } from '../../domain/errors/election-status-transition.error';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';
import { ElectionLedgerPort } from '../ports/election-ledger.port';
import { PendingMarksPort } from '../ports/pending-marks.port';
import { Logger, ConflictException } from '@nestjs/common';
import { ElectionAuditPort } from '../ports/election-audit.port';

// Manual closure is the ACTIVE -> CLOSED edge, triggered by an administrator rather than
// by the automatic scheduler. It reuses the same domain decision points as the automatic
// close (current state + `hasReachedEnd`) so the two cannot drift apart; the only
// differences are the human actor (audit entry) and the surfaced error for an election
// whose end instant has not yet been reached.
export class CloseElectionUseCase {
  private readonly log = new Logger(CloseElectionUseCase.name);
  private auditLog: { id: number } = { id: 0 };

  constructor(
    private readonly elections: Pick<ElectionRepository, 'findById' | 'updateStatus'>,
    private readonly audit: AuditLogPort,
    private readonly ledger: ElectionLedgerPort,
    private readonly marks: PendingMarksPort,
    private readonly auditPort: ElectionAuditPort,
  ) {}

  async execute(input: {
    electionId: string;
    requestingUserId: string;
    // Reference 'now' for deterministic tests; defaults to the current UTC time.
    now?: Date;
  }): Promise<ElectionEntity> {
    const { electionId, requestingUserId } = input;
    const now = input.now ?? new Date();

    if (!requestingUserId) throw new ElectionStartRequiresUserError();

    const election = await this.elections.findById(electionId);
    if (!election) throw new ElectionNotFoundError(electionId);

    if (election.currentStatus !== 'ACTIVE') {
      throw new ElectionStatusTransitionError(election.currentStatus, 'CLOSED');
    }

    if (!election.hasReachedEnd(now)) {
      throw new ElectionNotEndedError();
    }

    await this.marks.flush(electionId);
    const pending = await this.marks.pending(electionId);
    if (pending > 0) {
      throw new ConflictException({ code: 'PENDING_MARKS', pending });
    }

    try {
      this.auditLog = await this.auditPort.recordBlockchainAction({
        actorId: requestingUserId,
        actionType: 'CLOSE_ELECTION',
        electionId: electionId,
        status: 'PENDING',
        summary: `Cerrando la elección con ID ${electionId}`,
        transactions: [],
      });
      const ledgerResponse = await this._updateLedger(electionId);

      await this.auditPort.updateBlockchainActionStatus(this.auditLog.id, 'SUCCESS', [
        {
          step: 'CLOSE_ELECTION',
          txId: ledgerResponse.txId,
          status: 'SUCCESS',
          blockNumber: ledgerResponse.blockNumber,
        },
      ]);
    } catch {
      await this.auditPort.updateBlockchainActionStatus(this.auditLog.id, 'FAILED', [
        {
          step: 'CLOSE_ELECTION',
          txId: '',
          status: 'FAILED',
          blockNumber: 0,
          errorMessage: `Ocurrió un error al cerrar la elección con ID ${electionId} en Hyperledger Fabric`,
        },
      ]);
      throw new Error(`Failed to close election with ID ${electionId} on the Hyperledger Fabric`);
    }

    const updated = await this.elections.updateStatus(
      electionId,
      'CLOSED',
      requestingUserId,
      'ACTIVE',
    );
    if (!updated) {
      throw new ElectionStatusTransitionError('ACTIVE', 'CLOSED');
    }

    await this.audit.log('ELECTION_STATUS_CHANGED', requestingUserId, {
      electionId,
      newStatus: 'CLOSED',
    });

    return updated;
  }

  _updateLedger(electionId: string) {
    return this.ledger.close(electionId);
  }
}
