import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type { ElectoralRollRepository } from 'src/modules/elections/domain/repositories/electoral-roll.repository.interface';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import { ElectoralRollNotFoundError } from 'src/modules/elections/domain/errors/electoral-roll-not-found.error';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';
import { ElectorNotFoundError } from '../../domain/errors/elector-not-found.error';

export interface CheckElectorHasVotedInput {
  electorId: string;
  electionId: string;
}

export interface CheckElectorHasVotedResult {
  electionId: string;
  electorId: string;
  hasVoted: boolean;
}

// Read-only: answers whether an elector participated in an election using only the
// electoral roll's has_voted flag. Never reads candidacy or vote content.
export class CheckElectorHasVotedUseCase {
  constructor(
    private readonly electors: ElectorRepository,
    private readonly elections: ElectionRepository,
    private readonly electoralRolls: ElectoralRollRepository,
  ) {}

  async execute(input: CheckElectorHasVotedInput): Promise<CheckElectorHasVotedResult> {
    const { electorId, electionId } = input;

    const elector = await this.electors.findById(electorId);
    if (!elector) throw new ElectorNotFoundError(electorId);

    const election = await this.elections.findById(electionId);
    if (!election) throw new ElectionNotFoundError(electionId);

    const hasVoted = await this.electoralRolls.findHasVoted(electionId, electorId);
    if (hasVoted === null) throw new ElectoralRollNotFoundError(electionId, electorId);

    return { electionId, electorId, hasVoted };
  }
}
