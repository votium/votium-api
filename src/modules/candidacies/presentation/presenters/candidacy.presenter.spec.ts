import { CandidacyEntity } from '../../domain/entities/candidacy.entity';
import type { CandidacyWithCandidate } from '../../domain/repositories/candidacy.repository.interface';
import { CandidacyPresenter } from './candidacy.presenter';

function buildCandidacyWithCandidate(
  overrides: Partial<CandidacyWithCandidate> = {},
): CandidacyWithCandidate {
  return {
    id: 'candidacy-uuid',
    electionId: 'election-uuid',
    candidateId: 'candidate-uuid',
    candidateFirstName: 'Juan',
    candidateLastName: 'Garcia',
    positionNumber: 4,
    imageUrl: null,
    createdAt: new Date('2026-08-29T15:00:00.000Z'),
    ...overrides,
  };
}

describe('CandidacyPresenter', () => {
  it('P-01: maps the entity to the response DTO', () => {
    const entity = CandidacyEntity.restore({
      id: 'candidacy-uuid',
      electionId: 'election-uuid',
      candidateId: 'candidate-uuid',
      positionNumber: 4,
      imageUrl: null,
      createdAt: new Date('2026-08-29T15:00:00.000Z'),
    });

    const dto = CandidacyPresenter.toResponse(entity);

    expect(dto).toEqual({
      id: 'candidacy-uuid',
      electionId: 'election-uuid',
      candidateId: 'candidate-uuid',
      positionNumber: 4,
      imageUrl: null,
      createdAt: '2026-08-29T15:00:00.000Z',
    });
  });

  it('P-02: maps a non-null imageUrl and formats createdAt to ISO', () => {
    const entity = CandidacyEntity.restore({
      id: 'candidacy-uuid',
      electionId: 'election-uuid',
      candidateId: 'candidate-uuid',
      positionNumber: 1,
      imageUrl: 'https://example.com/photo.png',
      createdAt: new Date('2026-08-29T15:00:00.000Z'),
    });

    const dto = CandidacyPresenter.toResponse(entity);

    expect(dto.imageUrl).toBe('https://example.com/photo.png');
    expect(dto.createdAt).toBe('2026-08-29T15:00:00.000Z');
  });

  it('P-03: toCandidacyWithCandidate maps a candidacy projection to the response DTO shape', () => {
    const candidacy = buildCandidacyWithCandidate({
      imageUrl: 'https://example.com/photo.png',
      positionNumber: 7,
    });

    const dto = CandidacyPresenter.toCandidacyWithCandidate(candidacy);

    expect(dto).toEqual({
      id: 'candidacy-uuid',
      positionNumber: 7,
      imageUrl: 'https://example.com/photo.png',
      createdAt: '2026-08-29T15:00:00.000Z',
      candidate: {
        id: 'candidate-uuid',
        firstName: 'Juan',
        lastName: 'Garcia',
      },
    });
  });

  it('P-04: toElectionCandidacies delegates to toCandidacyWithCandidate (behavior-preserving refactor)', () => {
    const candidacy = buildCandidacyWithCandidate({ positionNumber: 2 });

    const result = CandidacyPresenter.toElectionCandidacies({
      electionName: 'Student Council Election 2026',
      candidacies: [candidacy],
    });

    expect(result).toEqual({
      electionName: 'Student Council Election 2026',
      candidacies: [CandidacyPresenter.toCandidacyWithCandidate(candidacy)],
    });
  });
});
