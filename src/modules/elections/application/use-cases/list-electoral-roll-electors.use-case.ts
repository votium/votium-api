import type { ElectorStatus } from 'src/modules/electors/domain/entities/elector.entity';
import type { ElectorRepository } from 'src/modules/electors/domain/repositories/elector.repository.interface';
import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';
import type { ListElectoralRollElectorsResult } from '../dtos/list-electoral-roll-electors-result';

export interface ListElectoralRollElectorsInput {
  electionId: string;
  page: number;
  limit: number;
  programCode?: string;
  studentCode?: string;
  name?: string;
  status?: ElectorStatus;
  identification?: string;
}

export class ListElectoralRollElectorsUseCase {
  constructor(
    private readonly elections: ElectionRepository,
    private readonly electors: ElectorRepository,
  ) {}

  async execute(input: ListElectoralRollElectorsInput): Promise<ListElectoralRollElectorsResult> {
    // Existence gate: a nonexistent election surfaces as the standard not-found
    // error, never as an empty page.
    const election = await this.elections.findById(input.electionId);
    if (!election) {
      throw new ElectionNotFoundError(input.electionId);
    }

    // Scoped, DB-level paginated query; read-only (no lifecycle gate, no mutation).
    const { electors, total } = await this.electors.findByElection({
      electionId: input.electionId,
      page: input.page,
      limit: input.limit,
      programCode: input.programCode,
      studentCode: input.studentCode,
      name: input.name,
      status: input.status,
      identification: input.identification,
    });

    return { electors, total };
  }
}
