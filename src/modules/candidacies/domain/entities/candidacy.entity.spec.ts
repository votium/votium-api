import { CandidacyEntity } from './candidacy.entity';

describe('CandidacyEntity', () => {
  describe('create', () => {
    it('E-01: creates an entity with null id/createdAt and captured fields', () => {
      const entity = CandidacyEntity.create({
        electionId: 'election-uuid',
        candidateId: 'candidate-uuid',
        positionNumber: 4,
      });

      expect(entity.id).toBeNull();
      expect(entity.createdAt).toBeNull();
      expect(entity.electionId).toBe('election-uuid');
      expect(entity.candidateId).toBe('candidate-uuid');
      expect(entity.positionNumber).toBe(4);
      expect(entity.imageUrl).toBeNull();
    });

    it('E-02: captures a provided imageUrl', () => {
      const entity = CandidacyEntity.create({
        electionId: 'election-uuid',
        candidateId: 'candidate-uuid',
        positionNumber: 1,
        imageUrl: 'https://example.com/photo.png',
      });

      expect(entity.imageUrl).toBe('https://example.com/photo.png');
    });

    it('E-03: defaults imageUrl to null when omitted', () => {
      const entity = CandidacyEntity.create({
        electionId: 'election-uuid',
        candidateId: 'candidate-uuid',
        positionNumber: 1,
      });

      expect(entity.imageUrl).toBeNull();
    });
  });

  describe('restore', () => {
    it('E-04: rebuilds the entity with id/createdAt intact', () => {
      const createdAt = new Date('2026-08-29T15:00:00.000Z');
      const entity = CandidacyEntity.restore({
        id: 'candidacy-uuid',
        electionId: 'election-uuid',
        candidateId: 'candidate-uuid',
        positionNumber: 2,
        imageUrl: 'https://example.com/photo.png',
        createdAt,
      });

      expect(entity.id).toBe('candidacy-uuid');
      expect(entity.createdAt).toBe(createdAt);
      expect(entity.electionId).toBe('election-uuid');
      expect(entity.candidateId).toBe('candidate-uuid');
      expect(entity.positionNumber).toBe(2);
      expect(entity.imageUrl).toBe('https://example.com/photo.png');
    });
  });
});
