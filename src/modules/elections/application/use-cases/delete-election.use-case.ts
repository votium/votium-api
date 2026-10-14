import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectionNotDeletableError } from '../../domain/errors/election-not-deletable.error';
import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import { ElectionHasCandidatesError } from '../../domain/errors/election-has-candidates.error';
import { ElectionHasVotesError } from '../../domain/errors/election-has-votes.error';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';

export class DeleteElectionUseCase {
  constructor(
    private readonly elections: ElectionRepository,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(id: string, requestingUserId: string): Promise<void> {
    const election = await this.elections.findById(id);
    if (!election) throw new ElectionNotFoundError(id);

    // Only elections in the deletable (pending/initial) lifecycle state may be removed.
    if (!election.isDeletable()) throw new ElectionNotDeletableError();

    if (await this.elections.hasCandidates(id)) {
      throw new ElectionHasCandidatesError();
    }

    if (await this.elections.hasVotes(id)) {
      throw new ElectionHasVotesError();
    }

    // Every business-rule check completed before any destructive persistence, so a
    // failure above leaves the election unchanged.
    await this.elections.delete(id);

    if (requestingUserId) {
      await this.audit.log('ELECTION_DELETED', requestingUserId, { electionId: id });
    }
  }
}
