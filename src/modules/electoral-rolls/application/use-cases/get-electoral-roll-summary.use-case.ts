import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type { ElectoralRollRepository } from '../../domain/repositories/electoral-roll.repository.interface';
import type { ElectoralRollSummaryResult } from '../dtos/electoral-roll-summary-result';

export class GetElectoralRollSummaryUseCase {
  constructor(
    private readonly elections: ElectionRepository,
    private readonly electoralRolls: ElectoralRollRepository,
  ) {}

  async execute(electionId: string): Promise<ElectoralRollSummaryResult> {
    // Existence check: a nonexistent election must surface as the standard
    // not-found error, never as an empty summary with zero registered voters.
    const election = await this.elections.findById(electionId);
    if (!election) {
      throw new ElectionNotFoundError(electionId);
    }

    // Efficient count from the persisted electoral-roll relationship. The
    // @@unique([election_id, elector_id]) constraint guarantees one registration
    // per elector per election, so this is already a distinct-elector count.
    const registeredVoters = await this.electoralRolls.countByElection(electionId);

    return {
      electionName: election.name,
      registeredVoters,
    };
  }
}
