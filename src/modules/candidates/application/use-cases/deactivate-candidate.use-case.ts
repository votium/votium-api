import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { CandidateEntity } from '../../domain/entities/candidate.entity';
import { CandidateNotFoundError } from '../../domain/errors/candidate-not-found.error';
import type { CandidateRepository } from '../../domain/repositories/candidate.repository.interface';

export class DeactivateCandidateUseCase {
  constructor(
    private readonly candidates: CandidateRepository,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(id: string, requestingUserId: string): Promise<void> {
    const candidate = await this.candidates.findById(id);
    if (!candidate) throw new CandidateNotFoundError(id);

    if (candidate.status === CandidateEntity.INACTIVE_STATUS) return;

    candidate.deactivate();

    const updated = await this.candidates.updateStatus(id, candidate.status);
    if (!updated) throw new CandidateNotFoundError(id);

    await this.audit.log('CANDIDATE_DEACTIVATED', requestingUserId, { candidateId: id });
  }
}
