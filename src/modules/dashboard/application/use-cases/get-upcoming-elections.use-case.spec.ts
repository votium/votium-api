import type {
  DashboardRepository,
  UpcomingElectionRow,
} from '../../domain/repositories/dashboard.repository.interface';
import { GetUpcomingElectionsUseCase } from './get-upcoming-elections.use-case';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function buildRow(overrides: Partial<UpcomingElectionRow> = {}): UpcomingElectionRow {
  return {
    id: 'election-1',
    name: 'Student Council Election 2026',
    startDate: new Date(Date.UTC(2026, 9, 15)),
    startTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
    electoralRollCount: 1,
    candidacyCount: 1,
    ...overrides,
  };
}

describe('GetUpcomingElectionsUseCase', () => {
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
    dashboard.findUpcomingElections.mockResolvedValue([]);
  });

  it('UP-01: computes a 30-day window from the injected now', async () => {
    const now = new Date('2026-09-15T00:00:00.000Z');

    await new GetUpcomingElectionsUseCase(dashboard).execute({ days: 30, now });

    expect(dashboard.findUpcomingElections.mock.calls).toEqual([
      [{ from: now, to: new Date(now.getTime() + 30 * MS_PER_DAY) }],
    ]);
  });

  it('UP-02: computes the window for 60 and 90 days', async () => {
    const now = new Date('2026-09-15T00:00:00.000Z');

    await new GetUpcomingElectionsUseCase(dashboard).execute({ days: 60, now });
    await new GetUpcomingElectionsUseCase(dashboard).execute({ days: 90, now });

    expect(dashboard.findUpcomingElections.mock.calls).toEqual([
      [{ from: now, to: new Date(now.getTime() + 60 * MS_PER_DAY) }],
      [{ from: now, to: new Date(now.getTime() + 90 * MS_PER_DAY) }],
    ]);
  });

  it('UP-04: derives a deterministic timeUntilStart from the combined start instant', async () => {
    const now = new Date('2026-09-15T00:00:00.000Z');
    dashboard.findUpcomingElections.mockResolvedValue([
      buildRow({
        startDate: new Date(Date.UTC(2026, 9, 15)),
        startTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
      }),
    ]);

    const [result] = await new GetUpcomingElectionsUseCase(dashboard).execute({ days: 30, now });

    expect(result.timeUntilStart).toBe('30d 8h 0m');
  });

  it('UP-05: fully configured when both prerequisites are satisfied', async () => {
    dashboard.findUpcomingElections.mockResolvedValue([
      buildRow({ electoralRollCount: 1, candidacyCount: 1 }),
    ]);

    const [result] = await new GetUpcomingElectionsUseCase(dashboard).execute({ days: 30 });

    expect(result.configurationPercentage).toBe(100);
  });

  it('UP-06: zero when neither prerequisite is satisfied', async () => {
    dashboard.findUpcomingElections.mockResolvedValue([
      buildRow({ electoralRollCount: 0, candidacyCount: 0 }),
    ]);

    const [result] = await new GetUpcomingElectionsUseCase(dashboard).execute({ days: 30 });

    expect(result.configurationPercentage).toBe(0);
  });

  it('UP-07: fifty when exactly one prerequisite is satisfied', async () => {
    dashboard.findUpcomingElections.mockResolvedValue([
      buildRow({ electoralRollCount: 1, candidacyCount: 0 }),
      buildRow({ id: 'election-2', electoralRollCount: 0, candidacyCount: 3 }),
    ]);

    const results = await new GetUpcomingElectionsUseCase(dashboard).execute({ days: 30 });

    expect(results.map((r) => r.configurationPercentage)).toEqual([50, 50]);
  });

  it('UP-08: returns an empty array when there are no upcoming elections', async () => {
    const result = await new GetUpcomingElectionsUseCase(dashboard).execute({ days: 30 });

    expect(result).toEqual([]);
  });

  it('UP-09: preserves repository ordering (no re-sort in the application layer)', async () => {
    dashboard.findUpcomingElections.mockResolvedValue([
      buildRow({ id: 'election-1', name: 'First' }),
      buildRow({ id: 'election-2', name: 'Second' }),
      buildRow({ id: 'election-3', name: 'Third' }),
    ]);

    const results = await new GetUpcomingElectionsUseCase(dashboard).execute({ days: 30 });

    expect(results.map((r) => r.name)).toEqual(['First', 'Second', 'Third']);
  });
});
