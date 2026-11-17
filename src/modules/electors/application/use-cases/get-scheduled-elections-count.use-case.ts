import type { ElectionRepository } from 'src/modules/elections/domain/repositories/election.repository.interface';
import { ElectorNotFoundError } from '../../domain/errors/elector-not-found.error';
import type { ElectorRepository } from '../../domain/repositories/elector.repository.interface';

export interface ScheduledElectionsCount {
  count: number;
}

// Read-only: counts CREATED elections where the elector is registered in the roll.
// Never reads election details or vote content.
export class GetScheduledElectionsCountUseCase {
  constructor(
    private readonly electors: Pick<ElectorRepository, 'findById'>,
    private readonly elections: Pick<ElectionRepository, 'countEligibleByElector'>,
  ) {}

  async execute(input: { electorId: string }): Promise<ScheduledElectionsCount> {
    // Resolve the elector first: an unknown or deleted elector is a 404, never a 0.
    const elector = await this.electors.findById(input.electorId);
    if (!elector) throw new ElectorNotFoundError(input.electorId);

    const count = await this.elections.countEligibleByElector({
      electorId: input.electorId,
      status: 'CREATED',
    });

    return { count };
  }
}
