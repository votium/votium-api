import { CandidateNotFoundError } from 'src/modules/candidates/domain/errors/candidate-not-found.error';
import type { CandidateRepository } from 'src/modules/candidates/domain/repositories/candidate.repository.interface';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { CandidacyEntity } from '../../domain/entities/candidacy.entity';
import { ElectionNotEligibleForCandidacyError } from '../../domain/errors/election-not-eligible-for-candidacy.error';
import type { CandidacyRepository } from '../../domain/repositories/candidacy.repository.interface';
import { lowestAvailablePosition } from '../position.util';

export class RegisterCandidacyUseCase {
  constructor(
    private readonly candidates: CandidateRepository,
    private readonly elections: ElectionRepository,
    private readonly candidacies: CandidacyRepository,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(input: {
    electionId: string;
    candidateId: string;
    requestingUserId: string;
  }): Promise<CandidacyEntity> {
    // 1. Election must exist.
    const election = await this.elections.findById(input.electionId);
    if (!election) throw new ElectionNotFoundError(input.electionId);

    // 2. Candidate must exist.
    const candidate = await this.candidates.findById(input.candidateId);
    if (!candidate) throw new CandidateNotFoundError(input.candidateId);

    // 3. Election must be in Pending status.
    if (!election.canAcceptCandidacy()) {
      throw new ElectionNotEligibleForCandidacyError();
    }

    // 4. Compute the lowest available position within the election. Used
    //    positions reflect all candidacy rows (including INACTIVE candidates'
    //    rows); deleting a candidacy frees its number, and an empty election
    //    restarts at 1. Concurrent registrations may compute the same number,
    //    but the unique constraint (position_number, election_id) rejects the
    //    second with CandidacyDuplicateError.
    const usedPositions = await this.candidacies.findUsedPositions(input.electionId);
    const positionNumber = lowestAvailablePosition(usedPositions);

    // 5. Create and persist the association.
    const entity = CandidacyEntity.create({
      electionId: input.electionId,
      candidateId: input.candidateId,
      positionNumber,
    });

    const saved = await this.candidacies.create(entity);

    // 6. Audit log.
    if (input.requestingUserId) {
      await this.audit.log('CANDIDACY_REGISTERED', input.requestingUserId, {
        electionId: saved.electionId,
        candidateId: saved.candidateId,
        candidacyId: saved.id,
      });
    }

    return saved;
  }
}
