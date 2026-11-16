import type { ElectionEntity } from '../../domain/entities/election.entity';
import { ElectionNotFoundError } from '../../domain/errors/election-not-found.error';
import { ElectionNotPublishedError } from '../../domain/errors/election-not-published.error';
import { ElectionResultsSyncInconsistentError } from '../../domain/errors/election-results-sync-inconsistent.error';
import type { ElectionResultCandidacyRef } from '../../domain/repositories/election-result.repository.interface';
import type { ElectionTallyEntry } from '../ports/election-results.port';
import { SynchronizeElectionResultsUseCase } from './synchronize-election-results.use-case';

const ELECTION_ID = 'election-1';

const REFS: ElectionResultCandidacyRef[] = [
  { id: 'candidacy-a', candidateId: 'candidate-a' },
  { id: 'candidacy-b', candidateId: 'candidate-b' },
  { id: 'candidacy-c', candidateId: 'candidate-c' },
];

function election(status: string): ElectionEntity {
  return { id: ELECTION_ID, currentStatus: status } as unknown as ElectionEntity;
}

function build(
  options: {
    election?: ElectionEntity | null;
    refs?: ElectionResultCandidacyRef[];
    tally?: ElectionTallyEntry[];
  } = {},
) {
  const elections = {
    findById: jest
      .fn()
      .mockResolvedValue(options.election === undefined ? election('PUBLISHED') : options.election),
  };
  const ledger = {
    tally: jest.fn().mockResolvedValue({
      status: 'PUBLISHED',
      total: 0,
      results: options.tally ?? [],
    }),
  };
  const results = {
    findCandidacyRefsByElection: jest.fn().mockResolvedValue(options.refs ?? REFS),
    synchronize: jest
      .fn()
      .mockImplementation((_id: string, rows: unknown[]) => Promise.resolve(rows.length)),
  };
  const useCase = new SynchronizeElectionResultsUseCase(elections, ledger, results);
  return { useCase, elections, ledger, results };
}

const entry = (candidateId: string, votes: number): ElectionTallyEntry => ({
  candidateId,
  name: candidateId,
  votes,
});

describe('SynchronizeElectionResultsUseCase', () => {
  it('SR-01: maps the tally by candidate_id, writes exact counts and returns the summary', async () => {
    const { useCase, results, ledger } = build({
      tally: [entry('candidate-a', 7), entry('candidate-b', 5)],
    });

    const summary = await useCase.execute({ electionId: ELECTION_ID });

    expect(ledger.tally).toHaveBeenCalledWith(ELECTION_ID);
    expect(results.synchronize).toHaveBeenCalledWith(ELECTION_ID, [
      { candidacyId: 'candidacy-a', votes: 7 },
      { candidacyId: 'candidacy-b', votes: 5 },
      { candidacyId: 'candidacy-c', votes: 0 },
    ]);
    expect(summary).toEqual({
      electionId: ELECTION_ID,
      synchronized: true,
      candidaciesSynchronized: 3,
      totalVotes: 12,
    });
  });

  it('SR-01b: also accepts the candidacy id as the ledger identifier', async () => {
    const { useCase, results } = build({ tally: [entry('candidacy-b', 4)] });

    await useCase.execute({ electionId: ELECTION_ID });

    expect(results.synchronize).toHaveBeenCalledWith(
      ELECTION_ID,
      expect.arrayContaining([{ candidacyId: 'candidacy-b', votes: 4 }]),
    );
  });

  it('SR-02: unknown election throws ElectionNotFoundError without querying the ledger', async () => {
    const { useCase, ledger, results } = build({ election: null });

    await expect(useCase.execute({ electionId: ELECTION_ID })).rejects.toBeInstanceOf(
      ElectionNotFoundError,
    );
    expect(ledger.tally).not.toHaveBeenCalled();
    expect(results.synchronize).not.toHaveBeenCalled();
  });

  it.each(['PENDING', 'CREATED', 'ACTIVE', 'CLOSED', 'CANCELLED', 'FINALIZING', 'SYNC_ERROR'])(
    'SR-03: %s election throws ElectionNotPublishedError without querying the ledger',
    async (status) => {
      const { useCase, ledger, results } = build({ election: election(status) });

      await expect(useCase.execute({ electionId: ELECTION_ID })).rejects.toBeInstanceOf(
        ElectionNotPublishedError,
      );
      expect(ledger.tally).not.toHaveBeenCalled();
      expect(results.synchronize).not.toHaveBeenCalled();
    },
  );

  it('SR-04: an empty tally writes every candidacy with 0 votes', async () => {
    const { useCase, results } = build({ tally: [] });

    const summary = await useCase.execute({ electionId: ELECTION_ID });

    expect(results.synchronize).toHaveBeenCalledWith(
      ELECTION_ID,
      REFS.map((ref) => ({ candidacyId: ref.id, votes: 0 })),
    );
    expect(summary.candidaciesSynchronized).toBe(3);
    expect(summary.totalVotes).toBe(0);
  });

  it('SR-05: a candidacy missing from the tally is written with 0 votes', async () => {
    const { useCase, results } = build({ tally: [entry('candidate-a', 2)] });

    await useCase.execute({ electionId: ELECTION_ID });

    const rows = (results.synchronize.mock.calls as unknown[][])[0][1] as unknown[];
    expect(rows).toContainEqual({ candidacyId: 'candidacy-c', votes: 0 });
  });

  it('SR-06: an unresolvable candidateId throws before writing', async () => {
    const { useCase, results } = build({ tally: [entry('candidate-a', 1), entry('ghost', 3)] });

    await expect(useCase.execute({ electionId: ELECTION_ID })).rejects.toBeInstanceOf(
      ElectionResultsSyncInconsistentError,
    );
    expect(results.synchronize).not.toHaveBeenCalled();
  });

  it.each([-1, 1.5, Number.NaN])(
    'SR-07: invalid votes (%p) throw before writing',
    async (votes) => {
      const { useCase, results } = build({ tally: [entry('candidate-a', votes)] });

      await expect(useCase.execute({ electionId: ELECTION_ID })).rejects.toBeInstanceOf(
        ElectionResultsSyncInconsistentError,
      );
      expect(results.synchronize).not.toHaveBeenCalled();
    },
  );

  it('SR-08: duplicate tally entries for one candidate are summed', async () => {
    const { useCase, results } = build({
      tally: [entry('candidate-a', 2), entry('candidate-a', 3)],
    });

    const summary = await useCase.execute({ electionId: ELECTION_ID });

    expect((results.synchronize.mock.calls as unknown[][])[0][1]).toContainEqual({
      candidacyId: 'candidacy-a',
      votes: 5,
    });
    expect(summary.totalVotes).toBe(5);
  });

  it('SR-09: a ledger failure propagates and nothing is written', async () => {
    const { useCase, ledger, results } = build();
    ledger.tally.mockRejectedValue(new Error('FABRIC_UNAVAILABLE'));

    await expect(useCase.execute({ electionId: ELECTION_ID })).rejects.toThrow(
      'FABRIC_UNAVAILABLE',
    );
    expect(results.synchronize).not.toHaveBeenCalled();
  });

  it('SR-10: the same input twice sends the same rows (idempotent contract)', async () => {
    const { useCase, results } = build({ tally: [entry('candidate-b', 9)] });

    await useCase.execute({ electionId: ELECTION_ID });
    await useCase.execute({ electionId: ELECTION_ID });

    expect(results.synchronize.mock.calls[0]).toEqual(results.synchronize.mock.calls[1]);
  });
});
