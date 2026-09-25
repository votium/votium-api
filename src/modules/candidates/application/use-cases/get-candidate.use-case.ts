import { CandidateEntity } from '../../domain/entities/candidate.entity';
import { CandidateNotFoundError } from '../../domain/errors/candidate-not-found.error';
import type { CandidateRepository } from '../../domain/repositories/candidate.repository.interface';
import type {
  CandidacyRepository,
  CandidacyWithElection,
} from 'src/modules/candidacies/domain/repositories/candidacy.repository.interface';

export interface CandidateDetailResult {
  candidate: CandidateEntity;
  elections: CandidacyWithElection[];
}

export class GetCandidateUseCase {
  constructor(
    private readonly candidates: CandidateRepository,
    private readonly candidacies: CandidacyRepository,
  ) {}

  async execute(id: string): Promise<CandidateDetailResult> {
    const candidate = await this.candidates.findById(id);
    if (!candidate) throw new CandidateNotFoundError(id);

    const elections = await this.candidacies.findByCandidate(id);

    return { candidate, elections };
  }
}
