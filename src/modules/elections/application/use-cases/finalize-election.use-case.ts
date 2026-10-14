import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectionEntity } from '../../domain/entities/election.entity';
import { ElectionMissingElectoralRollError } from '../../domain/errors/election-missing-electoral-roll.error';
import { ElectionNoCandidatesError } from '../../domain/errors/election-no-candidates.error';
import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import { ElectionStatusTransitionError } from '../../domain/errors/election-status-transition.error';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';

// Finalization is the PENDING -> CREATED edge: it freezes the election's
// configuration (basic info, dates, roll and candidacies) ahead of activation.
// This is where the roll and candidacy prerequisites live; starting the election
// (CREATED -> ACTIVE) no longer re-checks them, because by then they are sealed.
export class FinalizeElectionUseCase {
  constructor(
    private readonly elections: Pick<
      ElectionRepository,
      'findById' | 'updateStatus' | 'hasElectoralRoll' | 'hasCandidates'
    >,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(input: { electionId: string; requestingUserId: string }): Promise<ElectionEntity> {
    const { electionId, requestingUserId } = input;

    const election = await this.elections.findById(electionId);
    if (!election) throw new ElectionNotFoundError(electionId);

    // Only PENDING may be finalized. Repeated finalization of a CREATED election is
    // refused rather than silently accepted (D5), and the status check runs FIRST so
    // the 409 precedes the prerequisite checks below.
    if (election.currentStatus !== 'PENDING') {
      throw new ElectionStatusTransitionError(election.currentStatus, 'CREATED');
    }

    // The election must have an associated electoral roll (persisted relationship).
    if (!(await this.elections.hasElectoralRoll(electionId))) {
      throw new ElectionMissingElectoralRollError();
    }

    // At least one registered candidacy (persisted Candidacy rows).
    if (!(await this.elections.hasCandidates(electionId))) {
      throw new ElectionNoCandidatesError();
    }

    // Guarded write: only applies while still PENDING, so concurrent finalizers
    // cannot both record a CREATED transition.
    const updated = await this.elections.updateStatus(
      electionId,
      'CREATED',
      requestingUserId,
      'PENDING',
    );
    // A null result here means the guarded write lost the race (the election is no
    // longer PENDING), not that it vanished — report the same 409 as a refused move.
    if (!updated) {
      throw new ElectionStatusTransitionError('PENDING', 'CREATED');
    }

    await this.audit.log('ELECTION_STATUS_CHANGED', requestingUserId, {
      electionId,
      newStatus: 'CREATED',
    });

    return updated;
  }
}
