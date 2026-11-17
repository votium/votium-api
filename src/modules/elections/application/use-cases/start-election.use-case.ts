import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectionEntity } from '../../domain/entities/election.entity';
import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import { ElectionNotWithinScheduleError } from '../../domain/errors/election-not-within-schedule.error';
import { ElectionStartRequiresUserError } from '../../domain/errors/election-start-requires-user.error';
import { ElectionStatusTransitionError } from '../../domain/errors/election-status-transition.error';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';
import { ElectionLedgerPort } from '../ports/election-ledger.port';
import { ElectionAuditPort } from '../ports/election-audit.port';

export class StartElectionUseCase {
  private auditLog: { id: number } = { id: 0 };

  constructor(
    private readonly elections: Pick<ElectionRepository, 'findById' | 'updateStatus'>,
    private readonly audit: AuditLogPort,
    private readonly ledger: ElectionLedgerPort,
    private readonly auditPort: ElectionAuditPort,
  ) {}

  async execute(input: {
    electionId: string;
    requestingUserId: string;
    now?: Date;
  }): Promise<ElectionEntity> {
    const { electionId, requestingUserId } = input;
    const now = input.now ?? new Date();

    if (!requestingUserId) throw new ElectionStartRequiresUserError();

    const election = await this.elections.findById(electionId);
    if (!election) throw new ElectionNotFoundError(electionId);

    if (election.currentStatus !== 'CREATED') {
      throw new ElectionStatusTransitionError(election.currentStatus, 'ACTIVE');
    }

    if (!election.isWithinSchedule(now)) throw new ElectionNotWithinScheduleError();

    await this.audit.log('ELECTION_STATUS_CHANGED', requestingUserId, {
      electionId,
      newStatus: 'ACTIVE',
    });

    try {
      this.auditLog = await this.auditPort.recordBlockchainAction({
        actorId: requestingUserId,
        actionType: 'START_ELECTION',
        electionId: electionId,
        status: 'PENDING',
        summary: `Iniciando la elección con ID ${electionId}`,
        transactions: [],
      });
      const ledgerResponse = await this._updateLedger(electionId);

      await this.auditPort.updateBlockchainActionStatus(this.auditLog.id, 'SUCCESS', [
        {
          step: 'START_ELECTION',
          txId: ledgerResponse.txId,
          status: 'SUCCESS',
          blockNumber: ledgerResponse.blockNumber,
        },
      ]);
    } catch {
      await this.auditPort.updateBlockchainActionStatus(this.auditLog.id, 'FAILED', [
        {
          step: 'START_ELECTION',
          txId: '',
          status: 'FAILED',
          blockNumber: 0,
          errorMessage: `Ocurrió un error al iniciar la elección con ID ${electionId}`,
        },
      ]);
      throw new Error(`Failed to start election with ID ${electionId}`);
    }

    const updated = await this.elections.updateStatus(
      electionId,
      'ACTIVE',
      requestingUserId,
      'CREATED',
    );
    if (!updated) {
      throw new ElectionStatusTransitionError('CREATED', 'ACTIVE');
    }

    return updated;
  }

  _updateLedger(electionId: string) {
    return this.ledger.start(electionId);
  }
}
