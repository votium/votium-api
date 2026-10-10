import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import { CandidacyNotFoundError } from '../../domain/errors/candidacy-not-found.error';
import { ElectionNotEligibleForCandidacyError } from '../../domain/errors/election-not-eligible-for-candidacy.error';
import type { CandidacyRepository } from '../../domain/repositories/candidacy.repository.interface';

export class DeleteCandidacyUseCase {
  constructor(
    private readonly elections: ElectionRepository,
    private readonly candidacies: CandidacyRepository,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(input: {
    electionId: string;
    candidacyId: string;
    requestingUserId: string;
  }): Promise<void> {
    // 1. Election must exist.
    const election = await this.elections.findById(input.electionId);
    if (!election) throw new ElectionNotFoundError(input.electionId);

    // 2. Election must be Pending status. Single decision point reused from
    //    the election entity — same rule as candidacy registration/update.
    if (!election.canAcceptCandidacy()) {
      throw new ElectionNotEligibleForCandidacyError();
    }

    // 3. Candidacy must exist.
    const candidacy = await this.candidacies.findById(input.candidacyId);
    if (!candidacy) throw new CandidacyNotFoundError(input.candidacyId);

    // 4. Candidacy must belong to the specified election. A scope mismatch is
    //    treated as not-found, matching the existing resource-scoping
    //    convention. The repository also applies the same composite scope, so
    //    a candidacy from another election can never be removed.
    if (candidacy.electionId !== input.electionId) {
      throw new CandidacyNotFoundError(input.candidacyId);
    }

    // 5. Persist. Composite-scoped delete: only removes the candidacy that has
    //    BOTH the election id and the candidacy id. false (race: row vanished
    //    between read and delete) -> 404.
    const deleted = await this.candidacies.deleteByElectionAndCandidacyId(
      input.electionId,
      input.candidacyId,
    );
    if (!deleted) throw new CandidacyNotFoundError(input.candidacyId);

    // 6. Audit log.
    if (input.requestingUserId) {
      await this.audit.log('CANDIDACY_DELETED', input.requestingUserId, {
        electionId: input.electionId,
        candidacyId: input.candidacyId,
        candidateId: candidacy.candidateId,
      });
    }
  }
}
