import type { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { CandidateNotFoundError } from '../../domain/errors/candidate-not-found.error';
import type { CandidateRepository } from '../../domain/repositories/candidate.repository.interface';

export class DeleteCandidateUseCase {
  constructor(
    private readonly candidates: CandidateRepository,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(id: string, requestingUserId: string): Promise<void> {
    const candidate = await this.candidates.findById(id);
    if (!candidate) throw new CandidateNotFoundError(id);

    candidate.delete();

    const deleted = await this.candidates.softDelete(id);
    if (!deleted) throw new CandidateNotFoundError(id);

    if (requestingUserId) {
      await this.audit.log('CANDIDATE_DELETED', requestingUserId, { candidateId: id });
    }
  }
}
