import type {
  DashboardRepository,
  RecentActivityRow,
} from '../../domain/repositories/dashboard.repository.interface';

const RECENT_ACTIVITY_LIMIT = 5;

export class GetRecentActivityUseCase {
  constructor(private readonly dashboard: DashboardRepository) {}

  async execute(): Promise<RecentActivityRow[]> {
    return this.dashboard.findRecentActivity(RECENT_ACTIVITY_LIMIT);
  }
}
