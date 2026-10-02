import type { DashboardRepository } from '../../domain/repositories/dashboard.repository.interface';

export interface SystemSummaryResult {
  electionsCount: number;
  electorsCount: number;
  candidatesCount: number;
}

export class GetSystemSummaryUseCase {
  constructor(private readonly dashboard: DashboardRepository) {}

  async execute(): Promise<SystemSummaryResult> {
    const [electionsCount, electorsCount, candidatesCount] = await Promise.all([
      this.dashboard.countElections(),
      this.dashboard.countElectors(),
      this.dashboard.countCandidates(),
    ]);

    return { electionsCount, electorsCount, candidatesCount };
  }
}
