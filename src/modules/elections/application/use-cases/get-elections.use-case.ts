import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';
import type { ElectionStatus } from '../../domain/entities/election.entity';
import { parseElectionDate } from '../election-date.util';

export class GetElectionsUseCase {
  constructor(private readonly elections: ElectionRepository) {}

  async execute(params: {
    page: number;
    limit: number;
    name?: string;
    status?: ElectionStatus;
    startDate?: string;
    endDate?: string;
    active?: boolean;
  }) {
    const page = Number.isFinite(params.page) && params.page > 0 ? params.page : 1;
    const limit = Number.isFinite(params.limit) && params.limit > 0 ? params.limit : 10;

    // Default business rule: without an explicit status/active filter, return only
    // elections that are schedule-active right now.
    let active = params.active;
    if (params.active === undefined && params.status === undefined) {
      active = true;
    }

    return this.elections.findAll({
      page,
      limit,
      name: params.name,
      status: params.status,
      startDate: params.startDate ? parseElectionDate(params.startDate) : undefined,
      endDate: params.endDate ? parseElectionDate(params.endDate) : undefined,
      active,
    });
  }
}
