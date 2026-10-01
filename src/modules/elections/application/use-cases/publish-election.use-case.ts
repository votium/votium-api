import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectionEntity } from '../../domain/entities/election.entity';
import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import { ElectionStatusTransitionError } from '../../domain/errors/election-status-transition.error';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';

// Publication is the CLOSED -> PUBLISHED edge (D2): once an election has closed, an
// administrator publishes it. CLOSED is the only prerequisite — no roll, candidacy or
// schedule checks — because a closed election has necessarily passed all of them.
export class PublishElectionUseCase {
  constructor(
    private readonly elections: Pick<ElectionRepository, 'findById' | 'updateStatus'>,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(input: { electionId: string; requestingUserId: string }): Promise<ElectionEntity> {
    const { electionId, requestingUserId } = input;

    const election = await this.elections.findById(electionId);
    if (!election) throw new ElectionNotFoundError(electionId);

    // Only CLOSED may be published. A CREATED election must close first, and repeated
    // publication of an already-PUBLISHED election is refused, not silently accepted (D5).
    if (election.currentStatus !== 'CLOSED') {
      throw new ElectionStatusTransitionError(election.currentStatus, 'PUBLISHED');
    }

    // Guarded write: only applies while still CLOSED, so concurrent publishers cannot
    // both record a PUBLISHED transition.
    const updated = await this.elections.updateStatus(
      electionId,
      'PUBLISHED',
      requestingUserId,
      'CLOSED',
    );
    // A null result here means the guarded write lost the race (the election is no
    // longer CLOSED), not that it vanished — report the same 409 as a refused move.
    if (!updated) {
      throw new ElectionStatusTransitionError('CLOSED', 'PUBLISHED');
    }

    await this.audit.log('ELECTION_STATUS_CHANGED', requestingUserId, {
      electionId,
      newStatus: 'PUBLISHED',
    });

    return updated;
  }
}
