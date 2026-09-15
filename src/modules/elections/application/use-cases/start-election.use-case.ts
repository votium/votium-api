import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectionEntity } from '../../domain/entities/election.entity';
import { ElectionMissingElectoralRollError } from '../../domain/errors/election-missing-electoral-roll.error';
import { ElectionNoCandidatesError } from '../../domain/errors/election-no-candidates.error';
import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import { ElectionNotWithinScheduleError } from '../../domain/errors/election-not-within-schedule.error';
import { ElectionStartRequiresUserError } from '../../domain/errors/election-start-requires-user.error';
import { ElectionStatusTransitionError } from '../../domain/errors/election-status-transition.error';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';

export class StartElectionUseCase {
  constructor(
    private readonly elections: ElectionRepository,
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

    // The ACTIVE transition is persisted into ElectionStatusHistory with the
    // acting user (NOT NULL FK). An empty requestingUserId could never produce a
    // valid history row, so reject it before touching the persistence layer.
    if (!requestingUserId) throw new ElectionStartRequiresUserError();

    const election = await this.elections.findById(electionId);
    if (!election) throw new ElectionNotFoundError(electionId);

    // Only PENDING elections may be started. This duplicates the guard inside
    // markAsActive(); it intentionally runs FIRST so the "not in PENDING" case
    // surfaces as 409 before the schedule-422/roll checks below are reached.
    if (election.currentStatus !== 'PENDING') throw new ElectionStatusTransitionError();

    // Current date/time must be inside the configured start/closing window.
    if (!election.isWithinSchedule(now)) throw new ElectionNotWithinScheduleError();

    // The election must have an associated electoral roll (persisted relationship).
    if (!(await this.elections.hasElectoralRoll(electionId))) {
      throw new ElectionMissingElectoralRollError();
    }

    // At least one registered candidacy (persisted Candiday rows).
    if (!(await this.elections.hasCandidates(electionId))) {
      throw new ElectionNoCandidatesError();
    }

    // Every prerequisite validated: transition through the entity decision point.
    election.markAsActive();

    // Persist via the existing transactional status-transition path (records
    // ElectionStatusHistory). A null result means the election disappeared between
    // the read and the update (concurrent delete); surface the standard 404 rather
    // than returning success without a persisted change.
    const updated = await this.elections.updateStatus(electionId, 'ACTIVE', requestingUserId);
    if (!updated) throw new ElectionNotFoundError(electionId);

    // Audit the transition. requestingUserId is guaranteed non-empty above, so
    // the history row always has an actor.
    await this.audit.log('ELECTION_STATUS_CHANGED', requestingUserId, {
      electionId,
      newStatus: 'ACTIVE',
    });

    return updated;
  }
}
