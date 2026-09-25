import { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { CandidateEntity } from '../../domain/entities/candidate.entity';
import type { UpdateCandidateInput } from '../../domain/entities/update-candidate-input';
import { CandidateNotFoundError } from '../../domain/errors/candidate-not-found.error';
import type { CandidateRepository } from '../../domain/repositories/candidate.repository.interface';

export class UpdateCandidateUseCase {
  constructor(
    private readonly candidates: CandidateRepository,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(
    id: string,
    input: UpdateCandidateInput,
    requestingUserId: string,
  ): Promise<CandidateEntity> {
    const candidate = await this.candidates.findById(id);
    if (!candidate) throw new CandidateNotFoundError(id);

    // Logically deleted candidates must not be edited through this endpoint.
    if (candidate.status === CandidateEntity.INACTIVE_STATUS) {
      throw new CandidateNotFoundError(id);
    }

    candidate.update(input);

    const updated = await this.candidates.update(id, input);
    if (!updated) throw new CandidateNotFoundError(id);

    if (requestingUserId) {
      await this.audit.log('CANDIDATE_UPDATED', requestingUserId, { candidateId: id });
    }

    return updated;
  }
}
