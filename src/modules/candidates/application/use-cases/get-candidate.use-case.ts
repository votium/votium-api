import { CandidateEntity } from '../../domain/entities/candidate.entity';
import { CandidateNotFoundError } from '../../domain/errors/candidate-not-found.error';
import type { CandidateRepository } from '../../domain/repositories/candidate.repository.interface';

export class GetCandidateUseCase {
  constructor(private readonly candidates: CandidateRepository) {}

  async execute(id: string): Promise<CandidateEntity> {
    const candidate = await this.candidates.findById(id);
    if (!candidate) throw new CandidateNotFoundError(id);
    return candidate;
  }
}
