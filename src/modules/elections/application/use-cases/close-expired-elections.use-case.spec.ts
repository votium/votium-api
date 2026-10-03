import { ElectionEntity } from '../../domain/entities/election.entity';
import type { ElectionRepository } from '../../domain/repositories/election.repository.interface';
import { CloseExpiredElectionsUseCase } from './close-expired-elections.use-case';

// Eligible ACTIVE election, schedule window 2026-10-01 08:00:00Z .. 18:00:00Z
// (end instant 2026-10-01 18:00:00Z) unless overridden.
function buildElection(
  over: Partial<Parameters<typeof ElectionEntity.restore>[0]> = {},
): ElectionEntity {
  return ElectionEntity.restore({
    id: 'election-1',
    name: 'Student Council Election 2026',
    description: 'Election for the 2026 student council.',
    startDate: new Date(Date.UTC(2026, 9, 1)),
    startTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
    endDate: new Date(Date.UTC(2026, 9, 1)),
    endTime: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
    currentStatus: 'ACTIVE',
    blankVoteEnabled: false,
    createdAt: new Date('2026-08-19T15:00:00.000Z'),
    ...over,
  });
}

describe('CloseExpiredElectionsUseCase', () => {
  const elections: jest.Mocked<ElectionRepository> = {
    findAll: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    updateStatus: jest.fn(),
    hasCandidates: jest.fn(),
    hasVotes: jest.fn(),
    hasElectoralRoll: jest.fn(),
    findExpiredActive: jest.fn(),
    delete: jest.fn(),
  };

  // "Before end" reference clock (inside the schedule window).
  const BEFORE_END = new Date(Date.UTC(2026, 9, 1, 12, 0, 0));
  // Exact end boundary: now == endInstant.
  const AT_END = new Date(Date.UTC(2026, 9, 1, 18, 0, 0));

  function buildUseCase(): CloseExpiredElectionsUseCase {
    return new CloseExpiredElectionsUseCase(elections);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    elections.findExpiredActive.mockResolvedValue([]);
    elections.updateStatus.mockResolvedValue(buildElection({ currentStatus: 'CLOSED' }));
  });

  it('UC-1: returns all-zero counts and never transitions when no expired actives are found', async () => {
    const result = await buildUseCase().execute({ now: AT_END });

    expect(result).toEqual({
      evaluated: 0,
      eligible: 0,
      closed: 0,
      alreadyClosed: 0,
      failed: [],
    });
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
  });

  it('UC-2: skips a candidate whose end has not been reached relative to now (defense-in-depth)', async () => {
    // DB would normally exclude this; simulate a stale row returned by the query.
    elections.findExpiredActive.mockResolvedValue([buildElection()]);

    const result = await buildUseCase().execute({ now: BEFORE_END });

    expect(result.evaluated).toBe(1);
    expect(result.eligible).toBe(0);
    expect(result.closed).toBe(0);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
  });

  it('UC-3: closes at the exact end instant via a guarded system transition', async () => {
    elections.findExpiredActive.mockResolvedValue([buildElection()]);

    const result = await buildUseCase().execute({ now: AT_END });

    expect(result.closed).toBe(1);
    expect(elections.updateStatus.mock.calls).toHaveLength(1);
    expect(elections.updateStatus.mock.calls[0]).toEqual(['election-1', 'CLOSED', null, 'ACTIVE']);
  });

  it('UC-4: closes when now is past the end instant (no exact-timestamp requirement)', async () => {
    elections.findExpiredActive.mockResolvedValue([buildElection()]);

    const result = await buildUseCase().execute({
      now: new Date(Date.UTC(2026, 9, 1, 18, 0, 5)),
    });

    expect(result.closed).toBe(1);
    expect(elections.updateStatus.mock.calls).toHaveLength(1);
  });

  it('UC-5: closes an election that ended hours earlier (delayed execution / downtime)', async () => {
    elections.findExpiredActive.mockResolvedValue([buildElection()]);

    const result = await buildUseCase().execute({
      now: new Date(Date.UTC(2026, 9, 2, 2, 0, 0)),
    });

    expect(result.closed).toBe(1);
    expect(elections.updateStatus.mock.calls).toHaveLength(1);
  });

  it('UC-6: skips a non-ACTIVE candidate defensively without transitioning', async () => {
    elections.findExpiredActive.mockResolvedValue([buildElection({ currentStatus: 'PENDING' })]);

    const result = await buildUseCase().execute({ now: AT_END });

    expect(result.evaluated).toBe(1);
    expect(result.eligible).toBe(0);
    expect(result.closed).toBe(0);
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
  });

  it('UC-7: mixed batch — only eligible actives are closed and counts stay exact', async () => {
    elections.findExpiredActive.mockResolvedValue([
      buildElection({ id: 'election-1' }),
      buildElection({ id: 'election-2' }),
      buildElection({ id: 'election-3' }),
      buildElection({ id: 'election-4', currentStatus: 'PENDING' }),
      buildElection({ id: 'election-5', endDate: new Date(Date.UTC(2026, 9, 2)) }),
    ]);

    const result = await buildUseCase().execute({ now: AT_END });

    expect(result).toEqual({
      evaluated: 5,
      eligible: 3,
      closed: 3,
      alreadyClosed: 0,
      failed: [],
    });
    expect(elections.updateStatus.mock.calls).toHaveLength(3);
  });

  it('UC-8: counts a guarded-null transition as alreadyClosed, not a failure (race)', async () => {
    elections.findExpiredActive.mockResolvedValue([buildElection()]);
    elections.updateStatus.mockResolvedValue(null);

    const result = await buildUseCase().execute({ now: AT_END });

    expect(result.closed).toBe(0);
    expect(result.alreadyClosed).toBe(1);
    expect(result.failed).toEqual([]);
  });

  it('UC-9: idempotent across runs — the second run closes nothing and issues no extra transition', async () => {
    elections.findExpiredActive.mockResolvedValueOnce([buildElection()]).mockResolvedValueOnce([]);

    const first = await buildUseCase().execute({ now: AT_END });
    const second = await buildUseCase().execute({ now: AT_END });

    expect(first.closed).toBe(1);
    expect(second.closed).toBe(0);
    expect(elections.updateStatus.mock.calls).toHaveLength(1);
  });

  it('UC-10: isolates a per-election failure and still closes the remaining elections', async () => {
    const boom = new Error('database exploded');
    elections.findExpiredActive.mockResolvedValue([
      buildElection({ id: 'election-1' }),
      buildElection({ id: 'election-2' }),
    ]);
    elections.updateStatus
      .mockRejectedValueOnce(boom)
      .mockResolvedValueOnce(buildElection({ id: 'election-2', currentStatus: 'CLOSED' }));

    const result = await buildUseCase().execute({ now: AT_END });

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].electionId).toBe('election-1');
    expect(result.failed[0].error).toBe(boom);
    expect(result.closed).toBe(1);
    expect(elections.updateStatus.mock.calls).toHaveLength(2);
  });

  it('UC-11: propagates a findExpiredActive failure and never attempts a transition', async () => {
    elections.findExpiredActive.mockRejectedValue(new Error('database exploded'));

    await expect(buildUseCase().execute({ now: AT_END })).rejects.toThrow('database exploded');
    expect(elections.updateStatus.mock.calls).toHaveLength(0);
  });

  it('UC-12: keeps the original error object on the failed entry (not swallowed/stringified)', async () => {
    const boom = new Error('lock timeout');
    elections.findExpiredActive.mockResolvedValue([buildElection()]);
    elections.updateStatus.mockRejectedValue(boom);

    const result = await buildUseCase().execute({ now: AT_END });

    expect(result.failed[0]).toEqual({ electionId: 'election-1', error: boom });
  });

  it('UC-13: defaults the clock — execute() still queries with a Date instance', async () => {
    await buildUseCase().execute();

    expect(elections.findExpiredActive.mock.calls).toHaveLength(1);
    expect(elections.findExpiredActive.mock.calls[0]?.[0]).toBeInstanceOf(Date);
  });
});
