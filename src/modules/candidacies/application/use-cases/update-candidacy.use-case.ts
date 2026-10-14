import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type { CandidacyEntity, UpdateCandidacyInput } from '../../domain/entities/candidacy.entity';
import { CandidacyNotFoundError } from '../../domain/errors/candidacy-not-found.error';
import { ElectionNotEligibleForCandidacyError } from '../../domain/errors/election-not-eligible-for-candidacy.error';
import type { CandidacyRepository } from '../../domain/repositories/candidacy.repository.interface';

export class UpdateCandidacyUseCase {
  constructor(
    private readonly elections: ElectionRepository,
    private readonly candidacies: CandidacyRepository,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(input: {
    id: string;
    data: UpdateCandidacyInput;
    requestingUserId: string;
  }): Promise<CandidacyEntity> {
    // 1. Candidacy must exist.
    const candidacy = await this.candidacies.findById(input.id);
    if (!candidacy) throw new CandidacyNotFoundError(input.id);

    // 2. Election must exist (defensive — the FK makes this theoretical).
    const election = await this.elections.findById(candidacy.electionId);
    if (!election) throw new ElectionNotFoundError(candidacy.electionId);

    // 3. Election must be in Pending status. Single decision point reused
    //    from the election entity — same rule as candidacy registration.
    if (!election.canAcceptCandidacy()) {
      throw new ElectionNotEligibleForCandidacyError();
    }

    // 4. Entity owns the merge rules.
    candidacy.update(input.data);

    // 5. Persist. null (race: row vanished) → 404; P2002 → 409 via repo.
    const updated = await this.candidacies.update(input.id, input.data);
    if (!updated) throw new CandidacyNotFoundError(input.id);

    // 6. Audit log.
    if (input.requestingUserId) {
      await this.audit.log('CANDIDACY_UPDATED', input.requestingUserId, {
        candidacyId: updated.id as string,
        electionId: updated.electionId,
        candidateId: updated.candidateId,
      });
    }

    return updated;
  }
}
