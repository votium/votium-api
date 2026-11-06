import type {
  CandidateRepository,
  CandidateSearchParams,
  CandidateSearchResult,
} from '../../domain/repositories/candidate.repository.interface';

export class SearchCandidatesUseCase {
  constructor(private readonly candidates: CandidateRepository) {}

  async execute(params: CandidateSearchParams): Promise<CandidateSearchResult> {
    const page = Number.isFinite(params.page) && params.page > 0 ? params.page : 1;
    const limit = Number.isFinite(params.limit) && params.limit > 0 ? params.limit : 10;

    return this.candidates.search({ ...params, page, limit });
  }
}
