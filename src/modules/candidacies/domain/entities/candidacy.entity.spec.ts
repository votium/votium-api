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

  describe('update', () => {
    function buildEntity(): CandidacyEntity {
      return CandidacyEntity.restore({
        id: 'candidacy-uuid',
        electionId: 'election-uuid',
        candidateId: 'candidate-uuid',
        positionNumber: 1,
        imageUrl: 'https://example.com/photo.png',
        createdAt: new Date('2026-08-29T15:00:00.000Z'),
      });
    }

    it('E-05: applies the provided positionNumber and imageUrl', () => {
      const entity = buildEntity();
      entity.update({
        positionNumber: 3,
        imageUrl: 'https://example.com/new.png',
      });

      expect(entity.positionNumber).toBe(3);
      expect(entity.imageUrl).toBe('https://example.com/new.png');
    });

    it('E-06: partial update leaves omitted fields unchanged (only positionNumber)', () => {
      const entity = buildEntity();
      entity.update({ positionNumber: 4 });

      expect(entity.positionNumber).toBe(4);
      expect(entity.imageUrl).toBe('https://example.com/photo.png');
    });

    it('E-07: partial update leaves omitted fields unchanged (only imageUrl)', () => {
      const entity = buildEntity();
      entity.update({ imageUrl: 'https://example.com/new.png' });

      expect(entity.positionNumber).toBe(1);
      expect(entity.imageUrl).toBe('https://example.com/new.png');
    });

    it('E-08: imageUrl null clears the current value', () => {
      const entity = buildEntity();
      entity.update({ imageUrl: null });

      expect(entity.imageUrl).toBeNull();
      expect(entity.positionNumber).toBe(1);
    });

    it('E-09: an empty input is a no-op', () => {
      const entity = buildEntity();
      entity.update({});

      expect(entity.positionNumber).toBe(1);
      expect(entity.imageUrl).toBe('https://example.com/photo.png');
    });

    it('E-10: immutable fields (id, electionId, candidateId, createdAt) are never touched', () => {
      const entity = buildEntity();
      entity.update({ positionNumber: 9, imageUrl: null });

      expect(entity.id).toBe('candidacy-uuid');
      expect(entity.electionId).toBe('election-uuid');
      expect(entity.candidateId).toBe('candidate-uuid');
      expect(entity.createdAt?.toISOString()).toBe('2026-08-29T15:00:00.000Z');
    });

    it('E-11: undefined fields are ignored (undefined is not null, no accidental clear)', () => {
      const entity = buildEntity();
      entity.update({ positionNumber: undefined, imageUrl: undefined });

      expect(entity.positionNumber).toBe(1);
      expect(entity.imageUrl).toBe('https://example.com/photo.png');
    });

    it('E-12: positionNumber null is a no-op (the position is never nullable)', () => {
      const entity = buildEntity();
      entity.update({ positionNumber: null, imageUrl: 'https://example.com/new.png' });

      expect(entity.positionNumber).toBe(1);
      expect(entity.imageUrl).toBe('https://example.com/new.png');
    });
  });
});
