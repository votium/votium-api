import { CandidacyEntity } from '../../domain/entities/candidacy.entity';
import { CandidacyPresenter } from './candidacy.presenter';

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
});
