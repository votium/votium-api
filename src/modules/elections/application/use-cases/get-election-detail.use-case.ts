import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import type { ElectionEntity } from '../../domain/entities/election.entity';
import type {
  ElectionRepository,
  ElectionStatusHistoryEntry,
} from '../../domain/repositories/election.repository.interface';
import type {
  CandidacyRepository,
  CandidacyWithCandidate,
} from 'src/modules/candidacies/domain/repositories/candidacy.repository.interface';
import type { ElectoralRollRepository } from 'src/modules/electoral-rolls/domain/repositories/electoral-roll.repository.interface';

export interface ElectionDetailResult {
  election: ElectionEntity;
  statusHistory: ElectionStatusHistoryEntry[];
  candidacies: CandidacyWithCandidate[];
  registeredVoters: number;
}

// POCO use case, registered via useFactory in ElectionsModule (project convention).
export class GetElectionDetailUseCase {
  constructor(
    private readonly elections: ElectionRepository,
    private readonly candidacies: CandidacyRepository,
    private readonly electoralRolls: ElectoralRollRepository,
  ) {}

  async execute(id: string): Promise<ElectionDetailResult> {
    const election = await this.elections.findById(id);
    if (!election) {
      throw new ElectionNotFoundError(id);
    }

    // All relation queries are scoped by the same election id (consistency
    // rule), run in parallel after the existence gate.
    const [statusHistory, candidacies, registeredVoters] = await Promise.all([
      this.elections.findStatusHistory(id),
      this.candidacies.findByElection(id), // INACTIVE/deleted candidates excluded by the repository
      this.electoralRolls.countByElection(id), // distinct electors via @@unique([election_id, elector_id])
    ]);

    return { election, statusHistory, candidacies, registeredVoters };
  }
}
