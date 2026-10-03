import type { DashboardRepository } from '../../domain/repositories/dashboard.repository.interface';
import { GetSystemSummaryUseCase } from './get-system-summary.use-case';

describe('GetSystemSummaryUseCase', () => {
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

  it('SU-01: returns the exact repository counts for all three entities', async () => {
    dashboard.countElections.mockResolvedValue(7);
    dashboard.countElectors.mockResolvedValue(120);
    dashboard.countCandidates.mockResolvedValue(34);

    const result = await new GetSystemSummaryUseCase(dashboard).execute();

    expect(result).toEqual({ electionsCount: 7, electorsCount: 120, candidatesCount: 34 });
  });

  it('SU-02: returns zeros for an empty system', async () => {
    dashboard.countElections.mockResolvedValue(0);
    dashboard.countElectors.mockResolvedValue(0);
    dashboard.countCandidates.mockResolvedValue(0);

    const result = await new GetSystemSummaryUseCase(dashboard).execute();

    expect(result).toEqual({ electionsCount: 0, electorsCount: 0, candidatesCount: 0 });
  });

  it('SU-03: only reads from the repository (no mutation calls)', async () => {
    dashboard.countElections.mockResolvedValue(1);
    dashboard.countElectors.mockResolvedValue(1);
    dashboard.countCandidates.mockResolvedValue(1);

    await new GetSystemSummaryUseCase(dashboard).execute();

    expect(dashboard.countElections.mock.calls).toHaveLength(1);
    expect(dashboard.countElectors.mock.calls).toHaveLength(1);
    expect(dashboard.countCandidates.mock.calls).toHaveLength(1);
  });
});
