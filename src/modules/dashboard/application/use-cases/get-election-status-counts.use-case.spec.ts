import type { DashboardRepository } from '../../domain/repositories/dashboard.repository.interface';
import { GetElectionStatusCountsUseCase } from './get-election-status-counts.use-case';

describe('GetElectionStatusCountsUseCase', () => {
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

  it('ST-01: zero-fills the states that are absent from the group-by result', async () => {
    dashboard.countElectionsByStatus.mockResolvedValue({ PENDING: 2, ACTIVE: 3 });

    const result = await new GetElectionStatusCountsUseCase(dashboard).execute();

    expect(result).toEqual({ pending: 2, created: 0, active: 3, closed: 0, published: 0 });
  });

  it('ST-02: passes through exact counts when all five states are present', async () => {
    dashboard.countElectionsByStatus.mockResolvedValue({
      PENDING: 1,
      CREATED: 2,
      ACTIVE: 3,
      CLOSED: 4,
      PUBLISHED: 5,
    });

    const result = await new GetElectionStatusCountsUseCase(dashboard).execute();

    expect(result).toEqual({ pending: 1, created: 2, active: 3, closed: 4, published: 5 });
  });

  it('ST-03: returns all five keys as zero for an empty map', async () => {
    dashboard.countElectionsByStatus.mockResolvedValue({});

    const result = await new GetElectionStatusCountsUseCase(dashboard).execute();

    expect(result).toEqual({ pending: 0, created: 0, active: 0, closed: 0, published: 0 });
  });

  it('ST-04: maps each persisted enum value to its lowercase response key', async () => {
    dashboard.countElectionsByStatus.mockResolvedValue({ PUBLISHED: 7 });

    const result = await new GetElectionStatusCountsUseCase(dashboard).execute();

    expect(result).toEqual({ pending: 0, created: 0, active: 0, closed: 0, published: 7 });
  });
});
