import type {
  DashboardRepository,
  ElectionStatusCounts,
} from '../../domain/repositories/dashboard.repository.interface';

export class GetElectionStatusCountsUseCase {
  constructor(private readonly dashboard: DashboardRepository) {}

  async execute(): Promise<ElectionStatusCounts> {
    const counts = await this.dashboard.countElectionsByStatus();

    // Normalize the raw group-by map (persisted enum keys, only present states)
    // into the response shape: all five keys, zero for absent states.
    return {
      pending: counts.PENDING ?? 0,
      created: counts.CREATED ?? 0,
      active: counts.ACTIVE ?? 0,
      closed: counts.CLOSED ?? 0,
      published: counts.PUBLISHED ?? 0,
    };
  }
}
