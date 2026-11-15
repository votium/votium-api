import type { ElectionEntity } from 'src/modules/elections/domain/entities/election.entity';
import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import type { ElectoralRollRepository } from 'src/modules/elections/domain/repositories/electoral-roll.repository.interface';
import { ElectorNotFoundError } from '../../domain/errors/elector-not-found.error';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';

export interface GetVoterUpcomingElectionsInput {
  electorId: string;
  now?: Date;
}

export interface VoterUpcomingElectionItem {
  election: ElectionEntity;
  participantsCount: number;
  registeredVotersCount: number;
  participationPercentage: number;
  hasVoted: boolean;
}

// Read-only: CREATED elections starting within the next 30 days and ACTIVE elections
// in course where the authenticated elector is registered in the electoral roll.
export class GetVoterUpcomingElectionsUseCase {
  constructor(
    private readonly electors: ElectorRepository,
    private readonly elections: ElectionRepository,
    private readonly electoralRolls: ElectoralRollRepository,
  ) {}

  async execute(input: GetVoterUpcomingElectionsInput): Promise<VoterUpcomingElectionItem[]> {
    const elector = await this.electors.findById(input.electorId);
    if (!elector) throw new ElectorNotFoundError(input.electorId);

    const rows = await this.elections.findUpcomingAndActiveByElector({
      electorId: input.electorId,
      now: input.now,
    });
    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.election.id as string);
    const [registered, participants] = await Promise.all([
      this.electoralRolls.countByElectionIds(ids),
      this.electoralRolls.countVotedByElectionIds(ids),
    ]);

    // Both counts omit elections with 0 rows, so missing entries default to 0.
    const registeredById = new Map(registered.map((c) => [c.electionId, c.total]));
    const participantsById = new Map(participants.map((c) => [c.electionId, c.total]));

    return rows.map((row) => {
      const id = row.election.id as string;
      const registeredVotersCount = registeredById.get(id) ?? 0;
      const participantsCount = participantsById.get(id) ?? 0;
      return {
        election: row.election,
        participantsCount,
        registeredVotersCount,
        participationPercentage: percentage(participantsCount, registeredVotersCount),
        hasVoted: row.hasVoted,
      };
    });
  }
}

// participants / registered * 100 rounded to 2 decimals; 0 when the roll is empty.
function percentage(participants: number, registered: number): number {
  if (registered === 0) return 0;
  return Math.round((participants / registered) * 10000) / 100;
}
