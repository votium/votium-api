import type {
  DashboardRepository,
  RecentActivityRow,
} from '../../domain/repositories/dashboard.repository.interface';
import { GetRecentActivityUseCase } from './get-recent-activity.use-case';

function buildRow(overrides: Partial<RecentActivityRow> = {}): RecentActivityRow {
  return {
    action: 'ELECTION_CREATED',
    resourceType: 'Election',
    resourceName: 'Student Council Election 2026',
    userName: 'Jean Lerma',
    occurredAt: new Date('2026-10-02T18:09:26.116Z'),
    ...overrides,
  };
}

describe('GetRecentActivityUseCase', () => {
  const dashboard: jest.Mocked<DashboardRepository> = {
    countElections: jest.fn(),
    countCandidates: jest.fn(),
    countElectors: jest.fn(),
    countElectionsByStatus: jest.fn(),
    findUpcomingElections: jest.fn(),
    findRecentActivity: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('RA-01: requests the five most recent records', async () => {
    dashboard.findRecentActivity.mockResolvedValue([]);

    await new GetRecentActivityUseCase(dashboard).execute();

    expect(dashboard.findRecentActivity.mock.calls).toEqual([[5]]);
  });

  it('RA-02: passes repository rows through unchanged', async () => {
    const rows = [buildRow(), buildRow({ action: 'CANDIDATE_REGISTERED' })];
    dashboard.findRecentActivity.mockResolvedValue(rows);

    const result = await new GetRecentActivityUseCase(dashboard).execute();

    expect(result).toEqual(rows);
  });

  it('RA-03: returns an empty array when there is no activity', async () => {
    dashboard.findRecentActivity.mockResolvedValue([]);

    const result = await new GetRecentActivityUseCase(dashboard).execute();

    expect(result).toEqual([]);
  });
});
