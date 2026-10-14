import type { ElectionBallotResult } from '../../application/use-cases/get-election-ballot.use-case';
import type { CandidacyWithCandidate } from '../../domain/repositories/candidacy.repository.interface';
import { BallotPresenter } from './ballot.presenter';

function buildCandidacy(overrides: Partial<CandidacyWithCandidate> = {}): CandidacyWithCandidate {
  return {
    id: 'candidacy-uuid',
    electionId: 'election-uuid',
    candidateId: 'candidate-uuid',
    candidateFirstName: 'Juan',
    candidateLastName: 'Garcia',
    positionNumber: 1,
    imageUrl: null,
    createdAt: new Date('2026-08-29T15:00:00.000Z'),
    ...overrides,
  };
}

function buildResult(overrides: Partial<ElectionBallotResult> = {}): ElectionBallotResult {
  return {
    electionId: 'election-uuid',
    electionName: 'Student Council Election 2026',
    blankVote: { id: 'blank', enabled: true },
    candidacies: [buildCandidacy()],
    ...overrides,
  };
}

describe('BallotPresenter', () => {
  it('BP-01: maps a full result to the ballot response DTO', () => {
    const result = buildResult();

    const dto = BallotPresenter.toResponse(result);

    expect(dto).toEqual({
      election: { id: 'election-uuid', name: 'Student Council Election 2026' },
      candidacies: [
        {
          id: 'candidacy-uuid',
          positionNumber: 1,
          imageUrl: null,
          createdAt: '2026-08-29T15:00:00.000Z',
          candidate: { id: 'candidate-uuid', firstName: 'Juan', lastName: 'Garcia' },
        },
      ],
      blankVote: { id: 'blank', enabled: true },
    });
  });

  it('BP-02: preserves candidacy order and length in the DTO', () => {
    const candidacies = [
      buildCandidacy({ positionNumber: 1 }),
      buildCandidacy({ id: 'candidacy-3', candidateId: 'candidate-3', positionNumber: 3 }),
      buildCandidacy({ id: 'candidacy-4', candidateId: 'candidate-4', positionNumber: 4 }),
    ];

    const dto = BallotPresenter.toResponse(buildResult({ candidacies }));

    expect(dto.candidacies.map((c) => c.positionNumber)).toEqual([1, 3, 4]);
  });

  it('BP-03: serializes createdAt to ISO-8601 and preserves a non-null imageUrl', () => {
    const candidacy = buildCandidacy({
      imageUrl: 'https://example.com/p.png',
      createdAt: new Date('2026-08-29T15:00:00.000Z'),
    });

    const dto = BallotPresenter.toResponse(buildResult({ candidacies: [candidacy] }));

    expect(dto.candidacies[0].createdAt).toBe('2026-08-29T15:00:00.000Z');
    expect(dto.candidacies[0].imageUrl).toBe('https://example.com/p.png');
  });

  it('BP-04: maps the blank-vote option with its stable id and enabled state into the DTO', () => {
    const dto = BallotPresenter.toResponse(
      buildResult({ blankVote: { id: 'blank', enabled: true } }),
    );

    expect(dto.blankVote).toEqual({ id: 'blank', enabled: true });
  });
});
