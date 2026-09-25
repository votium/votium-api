import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type {
  CandidacyRepository,
  CandidacyWithCandidate,
} from '../../domain/repositories/candidacy.repository.interface';

export interface GetElectionCandidaciesQuery {
  electionId: string;
  candidateName?: string;
  electionName?: string;
}

export interface ElectionCandidaciesResult {
  electionName: string;
  candidacies: CandidacyWithCandidate[];
}

export class GetElectionCandidaciesUseCase {
  constructor(
    private readonly elections: ElectionRepository,
    private readonly candidacies: CandidacyRepository,
  ) {}

  async execute(params: GetElectionCandidaciesQuery): Promise<ElectionCandidaciesResult> {
    const election = await this.elections.findById(params.electionId);
    if (!election) {
      throw new ElectionNotFoundError(params.electionId);
    }

    const electionNameFilter = params.electionName?.trim();
    if (
      electionNameFilter &&
      !election.name.toLowerCase().includes(electionNameFilter.toLowerCase())
    ) {
      return { electionName: election.name, candidacies: [] };
    }

    const candidacies = await this.candidacies.findByElection(params.electionId, {
      candidateName: params.candidateName,
    });

    return { electionName: election.name, candidacies };
  }
}
