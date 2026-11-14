import type { ElectoralRollRepository } from 'src/modules/elections/domain/repositories/electoral-roll.repository.interface';
import { ElectorNotFoundError } from '../../domain/errors/elector-not-found.error';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';

export interface GetVoterActiveParticipationInput {
  electorId: string;
}

export interface VoterActiveParticipationResult {
  participatedElections: number;
  activeElections: number;
  participation: number;
}

// Read-only: how many ACTIVE elections the authenticated elector is registered for,
// how many of them they already voted in, and the resulting percentage.
export class GetVoterActiveParticipationUseCase {
  constructor(
    private readonly electors: ElectorRepository,
    private readonly electoralRolls: ElectoralRollRepository,
  ) {}

  async execute(input: GetVoterActiveParticipationInput): Promise<VoterActiveParticipationResult> {
    const elector = await this.electors.findById(input.electorId);
    if (!elector) throw new ElectorNotFoundError(input.electorId);

    const { activeElections, participatedElections } =
      await this.electoralRolls.countActiveParticipationByElector(input.electorId);

    return {
      participatedElections,
      activeElections,
      participation: percentage(participatedElections, activeElections),
    };
  }
}

// participated / active * 100 rounded to 2 decimals; 0 when there are no active elections.
function percentage(participated: number, active: number): number {
  if (active === 0) return 0;
  return Math.round((participated / active) * 10000) / 100;
}
