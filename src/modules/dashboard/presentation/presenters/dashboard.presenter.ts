import type { SystemSummaryResult } from '../../application/use-cases/get-system-summary.use-case';
import type { UpcomingElectionResult } from '../../application/use-cases/get-upcoming-elections.use-case';
import type {
  ElectionStatusCounts,
  RecentActivityRow,
} from '../../domain/repositories/dashboard.repository.interface';
import { DashboardSummaryResponseDto } from '../dtos/dashboard-summary-response.dto';
import { ElectionStatusCountsResponseDto } from '../dtos/election-status-counts-response.dto';
import {
  RecentActivityResourceDto,
  RecentActivityResponseDto,
  RecentActivityUserDto,
} from '../dtos/recent-activity-response.dto';
import { UpcomingElectionResponseDto } from '../dtos/upcoming-election-response.dto';

export class DashboardPresenter {
  static toSummary(result: SystemSummaryResult): DashboardSummaryResponseDto {
    return new DashboardSummaryResponseDto(result);
  }

  static toStatusCounts(counts: ElectionStatusCounts): ElectionStatusCountsResponseDto {
    return new ElectionStatusCountsResponseDto(counts);
  }

  static toUpcomingElections(results: UpcomingElectionResult[]): UpcomingElectionResponseDto[] {
    return results.map(
      (result) =>
        new UpcomingElectionResponseDto({
          name: result.name,
          startDate: result.startDate.toISOString(),
          timeUntilStart: result.timeUntilStart,
          configurationPercentage: result.configurationPercentage,
        }),
    );
  }

  static toRecentActivity(rows: RecentActivityRow[]): RecentActivityResponseDto[] {
    return rows.map(
      (row) =>
        new RecentActivityResponseDto({
          action: row.action,
          resource: new RecentActivityResourceDto({
            type: row.resourceType,
            name: row.resourceName,
          }),
          user: new RecentActivityUserDto({ name: row.userName }),
          occurredAt: row.occurredAt.toISOString(),
        }),
    );
  }
}
