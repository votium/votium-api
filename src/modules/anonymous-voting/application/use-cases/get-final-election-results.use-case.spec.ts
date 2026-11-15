import type { CandidacyWithCandidate } from 'src/modules/candidacies/domain/repositories/candidacy.repository.interface';
import type { ElectionEntity } from 'src/modules/elections/domain/entities/election.entity';
import { ElectionNotFoundError } from 'src/modules/elections/domain/errors/election-not-found.error';
import { ResultsNotPublishedError } from '../../domain/errors/results-not-published.error';
import type { TallyRow } from '../../domain/repositories/anonymous-voting.repository.interface';
import { GetFinalElectionResultsUseCase } from './get-final-election-results.use-case';

const ELECTION_ID = '3f1c2a9e-7b4d-4c1a-9f2e-1a2b3c4d5e6f';

function election(status: string): ElectionEntity {
  return {
    id: ELECTION_ID,
    name: 'Consejo 2026',
    currentStatus: status,
  } as unknown as ElectionEntity;
}

function candidacy(
  id: string,
  position: number,
  first = 'Ana',
  last = 'Pérez',
): CandidacyWithCandidate {
  return {
    id,
    electionId: ELECTION_ID,
    candidateId: `cand-${id}`,
    candidateFirstName: first,
    candidateLastName: last,
    positionNumber: position,
    imageUrl: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function build(
  found: ElectionEntity | null,
  visible: CandidacyWithCandidate[] = [],
  rows: TallyRow[] = [],
) {
  const elections = { findById: jest.fn().mockResolvedValue(found) };
  const candidacies = { findByElection: jest.fn().mockResolvedValue(visible) };
  const votes = { tally: jest.fn().mockResolvedValue(rows) };
  const useCase = new GetFinalElectionResultsUseCase(elections, candidacies, votes);
  return { useCase, elections, candidacies, votes };
}

describe('GetFinalElectionResultsUseCase', () => {
  it('throws ElectionNotFoundError when the election does not exist', async () => {
    const { useCase, candidacies, votes } = build(null);
    await expect(useCase.execute(ELECTION_ID)).rejects.toBeInstanceOf(ElectionNotFoundError);
    expect(candidacies.findByElection).not.toHaveBeenCalled();
    expect(votes.tally).not.toHaveBeenCalled();
  });

  it.each(['PENDING', 'CREATED', 'ACTIVE', 'CLOSED', 'CANCELLED', 'FINALIZING', 'SYNC_ERROR'])(
    'throws ResultsNotPublishedError when the election is %s',
    async (status) => {
      const { useCase, votes } = build(election(status));
      await expect(useCase.execute(ELECTION_ID)).rejects.toBeInstanceOf(ResultsNotPublishedError);
      expect(votes.tally).not.toHaveBeenCalled();
    },
  );

  it('returns the aggregated results of a PUBLISHED election', async () => {
    const { useCase, elections, candidacies, votes } = build(
      election('PUBLISHED'),
      [candidacy('c1', 1), candidacy('c2', 2, 'Luis', 'Gómez')],
      [
        { candidacyId: 'c1', votes: 6 },
        { candidacyId: 'c2', votes: 2 },
        { candidacyId: null, votes: 2 },
      ],
    );

    const result = await useCase.execute(ELECTION_ID);

    expect(result).toEqual({
      electionId: ELECTION_ID,
      electionName: 'Consejo 2026',
      totalVotes: 10,
      blankVotes: 2,
      candidacies: [
        {
          candidacyId: 'c1',
          candidateId: 'cand-c1',
          candidateName: 'Ana Pérez',
          positionNumber: 1,
          votes: 6,
        },
        {
          candidacyId: 'c2',
          candidateId: 'cand-c2',
          candidateName: 'Luis Gómez',
          positionNumber: 2,
          votes: 2,
        },
      ],
    });
    expect(elections.findById).toHaveBeenCalledWith(ELECTION_ID);
    expect(candidacies.findByElection).toHaveBeenCalledWith(ELECTION_ID);
    expect(votes.tally).toHaveBeenCalledWith(ELECTION_ID);
  });

  it('includes candidacies without votes with 0', async () => {
    const { useCase } = build(
      election('PUBLISHED'),
      [candidacy('c1', 1), candidacy('c2', 2)],
      [{ candidacyId: 'c1', votes: 3 }],
    );
    const result = await useCase.execute(ELECTION_ID);
    expect(result.candidacies.map((c) => c.votes)).toEqual([3, 0]);
  });

  it('accumulates repeated rows for the same candidacy and for blank votes', async () => {
    const { useCase } = build(
      election('PUBLISHED'),
      [candidacy('c1', 1)],
      [
        { candidacyId: 'c1', votes: 2 },
        { candidacyId: null, votes: 1 },
        { candidacyId: 'c1', votes: 3 },
        { candidacyId: null, votes: 4 },
      ],
    );
    const result = await useCase.execute(ELECTION_ID);
    expect(result.candidacies[0].votes).toBe(5);
    expect(result.blankVotes).toBe(5);
    expect(result.totalVotes).toBe(10);
  });

  it('with only blank votes, totalVotes equals blankVotes and candidacies stay at 0', async () => {
    const { useCase } = build(
      election('PUBLISHED'),
      [candidacy('c1', 1)],
      [{ candidacyId: null, votes: 4 }],
    );
    const result = await useCase.execute(ELECTION_ID);
    expect(result.totalVotes).toBe(4);
    expect(result.blankVotes).toBe(4);
    expect(result.candidacies[0].votes).toBe(0);
  });

  it('returns zeros and no candidacies for a PUBLISHED election without candidacies or votes', async () => {
    const { useCase } = build(election('PUBLISHED'));
    await expect(useCase.execute(ELECTION_ID)).resolves.toEqual({
      electionId: ELECTION_ID,
      electionName: 'Consejo 2026',
      totalVotes: 0,
      blankVotes: 0,
      candidacies: [],
    });
  });

  it('counts votes of a non-visible candidacy in totalVotes without creating a row', async () => {
    const { useCase } = build(
      election('PUBLISHED'),
      [candidacy('c1', 1)],
      [
        { candidacyId: 'c1', votes: 2 },
        { candidacyId: 'hidden', votes: 3 },
        { candidacyId: null, votes: 1 },
      ],
    );
    const result = await useCase.execute(ELECTION_ID);
    expect(result.totalVotes).toBe(6);
    expect(result.candidacies.map((c) => c.candidacyId)).toEqual(['c1']);
  });

  it('keeps the positionNumber order from the repository, even on ties', async () => {
    const { useCase } = build(
      election('PUBLISHED'),
      [candidacy('c1', 1), candidacy('c2', 2), candidacy('c3', 3)],
      [
        { candidacyId: 'c3', votes: 5 },
        { candidacyId: 'c2', votes: 5 },
      ],
    );
    const result = await useCase.execute(ELECTION_ID);
    expect(result.candidacies.map((c) => c.positionNumber)).toEqual([1, 2, 3]);
  });

  it('builds candidateName with a single space between first and last name', async () => {
    const { useCase } = build(election('PUBLISHED'), [candidacy('c1', 1, 'María', 'López')]);
    const result = await useCase.execute(ELECTION_ID);
    expect(result.candidacies[0].candidateName).toBe('María López');
  });

  it('only exposes aggregated fields (no ballot, payload or elector data)', async () => {
    const { useCase } = build(
      election('PUBLISHED'),
      [candidacy('c1', 1)],
      [{ candidacyId: 'c1', votes: 1 }],
    );
    const result = await useCase.execute(ELECTION_ID);
    expect(Object.keys(result).sort()).toEqual(
      ['blankVotes', 'candidacies', 'electionId', 'electionName', 'totalVotes'].sort(),
    );
    expect(Object.keys(result.candidacies[0]).sort()).toEqual(
      ['candidacyId', 'candidateId', 'candidateName', 'positionNumber', 'votes'].sort(),
    );
  });
});
