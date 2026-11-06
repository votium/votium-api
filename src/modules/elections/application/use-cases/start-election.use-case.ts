import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectionEntity } from '../../domain/entities/election.entity';
import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import { ElectionNotWithinScheduleError } from '../../domain/errors/election-not-within-schedule.error';
import { ElectionStartRequiresUserError } from '../../domain/errors/election-start-requires-user.error';
import { ElectionStatusTransitionError } from '../../domain/errors/election-status-transition.error';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';

export class StartElectionUseCase {
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

    // Start is CREATED -> ACTIVE (per target machine). Only CREATED may start.
    if (election.currentStatus !== 'CREATED') {
      throw new ElectionStatusTransitionError(election.currentStatus, 'ACTIVE');
    }

    // Current date/time must be inside the configured start/closing window.
    if (!election.isWithinSchedule(now)) throw new ElectionNotWithinScheduleError();

    // Persist via guarded write: only if still CREATED. If another process
    // changed state concurrently, return null -> treat as invalid transition (409).
    const updated = await this.elections.updateStatus(
      electionId,
      'ACTIVE',
      requestingUserId,
      'CREATED',
    );
    if (!updated) {
      throw new ElectionStatusTransitionError('CREATED', 'ACTIVE');
    }

    await this.audit.log('ELECTION_STATUS_CHANGED', requestingUserId, {
      electionId,
      newStatus: 'ACTIVE',
    });

    return updated;
  }
}
