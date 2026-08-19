import { AuditLogPort } from 'src/modules/iam/application/ports/audit-log.port';
import { CandidateEntity } from '../../domain/entities/candidate.entity';
import type { CandidateRepository } from '../../domain/repositories/candidate.repository.interface';

export class RegisterCandidateUseCase {
  constructor(
    private readonly candidates: CandidateRepository,
    private readonly audit: AuditLogPort,
  ) {}

  async execute(input: {
    firstName: string;
    lastName: string;
    studentCode: string;
    programCode: string;
    identificationNumber: string;
    requestingUserId: string;
  }) {
    const entity = CandidateEntity.create({
      firstName: input.firstName,
      lastName: input.lastName,
      studentCode: input.studentCode,
      programCode: input.programCode,
      identificationNumber: input.identificationNumber,
    });

    const saved = await this.candidates.create(entity);

    if (input.requestingUserId) {
      await this.audit.log('CANDIDATE_REGISTERED', input.requestingUserId, {
        candidateId: saved.id,
      });
    }

    return saved;
  }
}
