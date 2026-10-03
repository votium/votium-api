import type { SystemSummaryResult } from '../../application/use-cases/get-system-summary.use-case';
import type { UpcomingElectionResult } from '../../application/use-cases/get-upcoming-elections.use-case';
import type {
  ElectionStatusCounts,
  RecentActivityRow,
} from '../../domain/repositories/dashboard.repository.interface';
import { DashboardSummaryResponseDto } from '../dtos/dashboard-summary-response.dto';
import { ElectionStatusCountsResponseDto } from '../dtos/election-status-counts-response.dto';
import { RecentActivityResponseDto } from '../dtos/recent-activity-response.dto';
import { UpcomingElectionResponseDto } from '../dtos/upcoming-election-response.dto';
import { DashboardPresenter } from './dashboard.presenter';

describe('DashboardPresenter', () => {
  it('PR-01: serializes an upcoming election start date to ISO-8601 and passes the rest through', () => {
    const result: UpcomingElectionResult = {
      name: 'Student Council Election 2026',
      startDate: new Date('2026-10-15T08:00:00.000Z'),
      timeUntilStart: '12d 23h 5m',
      configurationPercentage: 100,
    };

    const [dto] = DashboardPresenter.toUpcomingElections([result]);

    expect(dto).toBeInstanceOf(UpcomingElectionResponseDto);
    expect(dto).toEqual({
      name: 'Student Council Election 2026',
      startDate: '2026-10-15T08:00:00.000Z',
      timeUntilStart: '12d 23h 5m',
      configurationPercentage: 100,
    });
  });

  it('PR-02: serializes recent activity into the nested resource/user shape', () => {
    const row: RecentActivityRow = {
      action: 'ELECTION_CREATED',
      resourceType: 'Election',
      resourceName: 'Student Council Election 2026',
      userName: 'Jean Lerma',
      occurredAt: new Date('2026-10-02T18:09:26.116Z'),
    };

    const [dto] = DashboardPresenter.toRecentActivity([row]);

    expect(dto).toBeInstanceOf(RecentActivityResponseDto);
    expect(dto).toEqual({
      action: 'ELECTION_CREATED',
      resource: { type: 'Election', name: 'Student Council Election 2026' },
      user: { name: 'Jean Lerma' },
      occurredAt: '2026-10-02T18:09:26.116Z',
    });
  });

  it('PR-03: passes summary and status-counts results through as response DTOs', () => {
    const summary: SystemSummaryResult = {
      electionsCount: 3,
      electorsCount: 40,
      candidatesCount: 12,
    };
    const statusCounts: ElectionStatusCounts = {
      pending: 1,
      created: 2,
      active: 3,
      closed: 4,
      published: 5,
    };

    const summaryDto = DashboardPresenter.toSummary(summary);
    const statusDto = DashboardPresenter.toStatusCounts(statusCounts);

    expect(summaryDto).toBeInstanceOf(DashboardSummaryResponseDto);
    expect(summaryDto).toEqual({ electionsCount: 3, electorsCount: 40, candidatesCount: 12 });
    expect(statusDto).toBeInstanceOf(ElectionStatusCountsResponseDto);
    expect(statusDto).toEqual({ pending: 1, created: 2, active: 3, closed: 4, published: 5 });
  });
});
