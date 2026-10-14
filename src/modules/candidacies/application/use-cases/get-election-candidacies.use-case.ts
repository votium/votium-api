import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type {
  CandidacyPageResult,
  CandidacyRepository,
} from '../../domain/repositories/candidacy.repository.interface';

export interface GetElectionCandidaciesQuery {
  electionId: string;
  page: number;
  limit: number;
  candidateName?: string;
}

export class GetElectionCandidaciesUseCase {
  constructor(
    private readonly elections: ElectionRepository,
    private readonly candidacies: CandidacyRepository,
  ) {}

  async execute(params: GetElectionCandidaciesQuery): Promise<CandidacyPageResult> {
    const election = await this.elections.findById(params.electionId);
    if (!election) {
      throw new ElectionNotFoundError(params.electionId);
    }

    // Pagination + candidateName filtering happen at the persistence layer; the
    // result is scoped to the requested election and never reshaped here.
    return this.candidacies.findPaginatedByElection(params.electionId, {
      page: params.page,
      limit: params.limit,
      candidateName: params.candidateName,
    });
  }
}
