import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectionEntity } from '../../domain/entities/election.entity';
import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import { ElectionNotEndedError } from '../../domain/errors/election-not-ended.error';
import { ElectionStartRequiresUserError } from '../../domain/errors/election-start-requires-user.error';
import { ElectionStatusTransitionError } from '../../domain/errors/election-status-transition.error';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';

// Manual closure is the ACTIVE -> CLOSED edge, triggered by an administrator rather than
// by the automatic scheduler. It reuses the same domain decision points as the automatic
// close (current state + `hasReachedEnd`) so the two cannot drift apart; the only
// differences are the human actor (audit entry) and the surfaced error for an election
// whose end instant has not yet been reached.
export class CloseElectionUseCase {
  constructor(
    private readonly elections: Pick<ElectionRepository, 'findById' | 'updateStatus'>,
    private readonly audit: AuditLogPort,
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

    // Only ACTIVE may close. A cancelled/published/created/pending election is refused.
    if (election.currentStatus !== 'ACTIVE') {
      throw new ElectionStatusTransitionError(election.currentStatus, 'CLOSED');
    }

    // Respect the configured voting schedule: the end instant must have been reached
    // (same decision point as the automatic closure).
    if (!election.hasReachedEnd(now)) {
      throw new ElectionNotEndedError();
    }

    // Guarded write: only closes an election still ACTIVE. A concurrent transition
    // (e.g. cancellation) loses the race and returns null -> 409.
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
}
