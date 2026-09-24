import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';

// Summary of one automatic-closure run. Counts are returned (not just logged) so the
// scheduler can surface progress and failures without re-querying the database.
export interface CloseExpiredElectionsResult {
  // ACTIVE elections whose end instant <= now (from the DB query).
  evaluated: number;
  // Elections that passed the domain eligibility checks (status + hasReachedEnd).
  eligible: number;
  // Successfully transitioned ACTIVE -> CLOSED.
  closed: number;
  // Guarded transition returned null (already transitioned concurrently / race).
  alreadyClosed: number;
  // Per-election failures: one failing election never blocks the rest.
  failed: Array<{ electionId: string; error: unknown }>;
}

// Closes every ACTIVE election whose configured end instant has been reached.
// Invoked by the scheduler (background job), independent of any HTTP request.
// Intentionally writes no audit entry: AuditLog.user_id is a NOT NULL FK and there
// is no human actor — the ElectionStatusHistory row (user_id NULL) is the record.
export class CloseExpiredElectionsUseCase {
  constructor(private readonly elections: ElectionRepository) {}

  async execute(input: { now?: Date } = {}): Promise<CloseExpiredElectionsResult> {
    const now = input.now ?? new Date();
    const candidates = await this.elections.findExpiredActive(now);
    const result: CloseExpiredElectionsResult = {
      evaluated: candidates.length,
      eligible: 0,
      closed: 0,
      alreadyClosed: 0,
      failed: [],
    };

    for (const election of candidates) {
      try {
        // Defensive: the DB query already filters on ACTIVE + ended, but a stale or
        // hand-crafted row must never be transitioned without domain validation.
        if (election.currentStatus !== 'ACTIVE') continue;
        if (!election.hasReachedEnd(now)) continue;

        // Domain transition validation: only ACTIVE may close (throws otherwise).
        election.markAsClosed();
        result.eligible += 1;

        // Persist via the guarded transition path: only closes an election still
        // ACTIVE (idempotent under concurrency; losers get null, no duplicate
        // history). requestingUserId is null — system (automatic) transition.
        const updated = await this.elections.updateStatus(
          election.id as string,
          'CLOSED',
          null,
          'ACTIVE',
        );
        if (updated) result.closed += 1;
        else result.alreadyClosed += 1;
      } catch (error) {
        // Isolate the failure: record it and keep processing the remaining elections.
        result.failed.push({ electionId: election.id ?? 'unknown', error });
      }
    }

    return result;
  }
}
