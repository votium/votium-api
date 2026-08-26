import { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { CandidateEntity } from '../../domain/entities/candidate.entity';
import { CandidateNotFoundError } from '../../domain/errors/candidate-not-found.error';
import { CandidateAlreadyActiveError } from '../../domain/errors/candidate-already-active.error';
import type { CandidateRepository } from '../../domain/repositories/candidate.repository.interface';

export class ReactivateCandidateUseCase {
  constructor(
    private readonly candidates: CandidateRepository,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(id: string, requestingUserId: string): Promise<CandidateEntity> {
    const candidate = await this.candidates.findById(id);
    if (!candidate) throw new CandidateNotFoundError(id);

    // An already-active candidate cannot be reactivated. This is a conflict, not a
    // silent no-op — intentionally asymmetric to deactivate (per the spec).
    if (candidate.status === CandidateEntity.DEFAULT_STATUS) {
      throw new CandidateAlreadyActiveError();
    }

    candidate.reactivate();

    const updated = await this.candidates.updateStatus(id, candidate.status);
    if (!updated) throw new CandidateNotFoundError(id);

    if (requestingUserId) {
      await this.audit.log('CANDIDATE_REACTIVATED', requestingUserId, { candidateId: id });
    }

    return updated;
  }
}
