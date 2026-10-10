import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectionEntity } from '../../domain/entities/election.entity';
import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import { ElectionStartRequiresUserError } from '../../domain/errors/election-start-requires-user.error';
import { ElectionStatusTransitionError } from '../../domain/errors/election-status-transition.error';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';

// Cancellation is the terminal sink of the lifecycle: any non-terminal state
// (PENDING, CREATED, ACTIVE, CLOSED) may be cancelled, and the election can never move
// out of CANCELLED again. PUBLISHED (also terminal) and CANCELLED itself are refused via
// the single domain decision point `canTransitionTo('CANCELLED')`.
export class CancelElectionUseCase {
  constructor(
    private readonly elections: Pick<ElectionRepository, 'findById' | 'updateStatus'>,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(input: { electionId: string; requestingUserId: string }): Promise<ElectionEntity> {
    const { electionId, requestingUserId } = input;

    if (!requestingUserId) throw new ElectionStartRequiresUserError();

    const election = await this.elections.findById(electionId);
    if (!election) throw new ElectionNotFoundError(electionId);

    // Only non-terminal states may be cancelled. PUBLISHED and CANCELLED refuse here, so
    // a repeated cancel is non-idempotent (409) and never reaches the guarded write.
    if (!election.canTransitionTo('CANCELLED')) {
      throw new ElectionStatusTransitionError(election.currentStatus, 'CANCELLED');
    }

    // Guarded write keyed on the *actual* source status read above: only transitions if
    // the election is still in that exact status. A concurrent cancel (or any other
    // transition) loses the race and returns null -> 409, with no duplicate history row.
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
}
