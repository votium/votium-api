import { CandidateEntity } from '../../domain/entities/candidate.entity';
import type {
  CandidateRepository,
  CandidateSearchParams,
} from '../../domain/repositories/candidate.repository.interface';

export class SearchCandidatesUseCase {
  constructor(private readonly candidates: CandidateRepository) {}

  execute(params: CandidateSearchParams): Promise<CandidateEntity[]> {
    return this.candidates.search(params);
  }
}
