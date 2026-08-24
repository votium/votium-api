import { ElectionEntity } from './election.entity';

describe('ElectionEntity', () => {
  const baseInput = {
    name: 'Student Council Election 2026',
    description: 'Election for the 2026 student council.',
    startDate: new Date(Date.UTC(2026, 9, 1)),
    startTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
    endDate: new Date(Date.UTC(2026, 9, 1)),
    endTime: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
  };

  describe('create', () => {
    it('creates an election with CREATED status by default', () => {
      const entity = ElectionEntity.create(baseInput);
      expect(entity.currentStatus).toBe(ElectionEntity.DEFAULT_STATUS);
      expect(entity.currentStatus).toBe('CREATED');
    });

    it('defaults blankVoteEnabled to false', () => {
      const entity = ElectionEntity.create(baseInput);
      expect(entity.blankVoteEnabled).toBe(false);
    });

    it('does not assign id or createdAt (Prisma generates them)', () => {
      const entity = ElectionEntity.create(baseInput);
      expect(entity.id).toBeNull();
      expect(entity.createdAt).toBeNull();
    });

    it('trims whitespace from name and description', () => {
      const entity = ElectionEntity.create({
        ...baseInput,
        name: '  Election Name  ',
        description: '  Some description  ',
      });
      expect(entity.name).toBe('Election Name');
      expect(entity.description).toBe('Some description');
    });

    it('honors an explicit blankVoteEnabled override', () => {
      const entity = ElectionEntity.create({ ...baseInput, blankVoteEnabled: true });
      expect(entity.blankVoteEnabled).toBe(true);
    });
  });

  describe('restore', () => {
    it('rebuilds all fields including id and createdAt', () => {
      const createdAt = new Date('2026-08-19T15:00:00.000Z');
      const entity = ElectionEntity.restore({
        id: 'election-1',
        ...baseInput,
        currentStatus: 'CREATED',
        blankVoteEnabled: false,
        createdAt,
      });
      expect(entity.id).toBe('election-1');
      expect(entity.createdAt).toBe(createdAt);
      expect(entity.name).toBe('Student Council Election 2026');
      expect(entity.currentStatus).toBe('CREATED');
      expect(entity.blankVoteEnabled).toBe(false);
    });

    it('preserves values without re-normalizing them', () => {
      const entity = ElectionEntity.restore({
        id: 'election-1',
        name: '  Election Name  ',
        description: '  Some description  ',
        startDate: baseInput.startDate,
        startTime: baseInput.startTime,
        endDate: baseInput.endDate,
        endTime: baseInput.endTime,
        currentStatus: 'CREATED',
        blankVoteEnabled: false,
        createdAt: new Date('2026-08-19T15:00:00.000Z'),
      });
      expect(entity.name).toBe('  Election Name  ');
      expect(entity.id).toBe('election-1');
    });
  });
});
