import { ElectionEntity } from './election.entity';
import { ElectionStatusTransitionError } from '../errors/election-status-transition.error';

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

  describe('update', () => {
    function makeElection(
      over: Partial<Parameters<typeof ElectionEntity.restore>[0]> = {},
    ): ElectionEntity {
      return ElectionEntity.restore({
        id: 'election-1',
        name: 'Original Name',
        description: 'Original description',
        startDate: new Date(Date.UTC(2026, 9, 1)),
        startTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        endDate: new Date(Date.UTC(2026, 9, 1)),
        endTime: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
        currentStatus: 'CREATED',
        blankVoteEnabled: false,
        createdAt: new Date('2026-08-19T15:00:00.000Z'),
        ...over,
      });
    }

    it('merges provided fields and trims name/description', () => {
      const e = makeElection();
      e.update({ name: '  New Name  ', description: '  New Desc  ' });
      expect(e.name).toBe('New Name');
      expect(e.description).toBe('New Desc');
    });

    it('is a no-op when no fields are provided', () => {
      const e = makeElection();
      const nameBefore = e.name;
      const descBefore = e.description;
      e.update({});
      expect(e.name).toBe(nameBefore);
      expect(e.description).toBe(descBefore);
    });

    it('assigns only the provided date/time parts', () => {
      const e = makeElection();
      const newStart = new Date(Date.UTC(2026, 10, 2));
      const newStartTime = new Date(Date.UTC(1970, 0, 1, 9, 0, 0));
      e.update({ startDate: newStart, startTime: newStartTime });
      expect(e.startDate).toBe(newStart);
      expect(e.startTime).toBe(newStartTime);
      expect(e.endDate.getUTCDate()).toBe(1);
      expect(e.endTime.getUTCHours()).toBe(18);
    });

    it('never alters immutable fields (id, currentStatus, createdAt)', () => {
      const e = makeElection();
      const id = e.id;
      const status = e.currentStatus;
      const createdAt = e.createdAt;
      e.update({ name: 'Changed' });
      expect(e.id).toBe(id);
      expect(e.currentStatus).toBe(status);
      expect(e.createdAt).toBe(createdAt);
    });
  });

  describe('isEditable', () => {
    function makeElection(currentStatus: string): ElectionEntity {
      return ElectionEntity.restore({
        id: 'election-1',
        name: 'n',
        description: 'd',
        startDate: new Date(Date.UTC(2026, 9, 1)),
        startTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        endDate: new Date(Date.UTC(2026, 9, 1)),
        endTime: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
        currentStatus: currentStatus as ElectionEntity['currentStatus'],
        blankVoteEnabled: false,
        createdAt: new Date('2026-08-19T15:00:00.000Z'),
      });
    }

    it('is true for CREATED', () => {
      expect(makeElection('CREATED').isEditable()).toBe(true);
    });

    it('is false for any non-CREATED status', () => {
      for (const status of ['PENDING', 'PUBLISHED', 'CLOSED', 'ACTIVE']) {
        expect(makeElection(status).isEditable()).toBe(false);
      }
    });
  });

  describe('isDeletable', () => {
    function makeElection(currentStatus: string): ElectionEntity {
      return ElectionEntity.restore({
        id: 'election-1',
        name: 'n',
        description: 'd',
        startDate: new Date(Date.UTC(2026, 9, 1)),
        startTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        endDate: new Date(Date.UTC(2026, 9, 1)),
        endTime: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
        currentStatus: currentStatus as ElectionEntity['currentStatus'],
        blankVoteEnabled: false,
        createdAt: new Date('2026-08-19T15:00:00.000Z'),
      });
    }

    it('is true for CREATED', () => {
      expect(makeElection('CREATED').isDeletable()).toBe(true);
    });

    it('is false for any non-CREATED status', () => {
      for (const status of ['PENDING', 'PUBLISHED', 'CLOSED', 'ACTIVE']) {
        expect(makeElection(status).isDeletable()).toBe(false);
      }
    });
  });

  describe('isRollLoadable', () => {
    function makeElection(currentStatus: string): ElectionEntity {
      return ElectionEntity.restore({
        id: 'election-1',
        name: 'n',
        description: 'd',
        startDate: new Date(Date.UTC(2026, 9, 1)),
        startTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        endDate: new Date(Date.UTC(2026, 9, 1)),
        endTime: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
        currentStatus: currentStatus as ElectionEntity['currentStatus'],
        blankVoteEnabled: false,
        createdAt: new Date('2026-08-19T15:00:00.000Z'),
      });
    }

    it('TS1: is true for CREATED', () => {
      expect(makeElection('CREATED').isRollLoadable()).toBe(true);
    });

    it('TS2: is true for PENDING', () => {
      expect(makeElection('PENDING').isRollLoadable()).toBe(true);
    });

    it('TS3: is false for PUBLISHED', () => {
      expect(makeElection('PUBLISHED').isRollLoadable()).toBe(false);
    });

    it('TS4: is false for ACTIVE', () => {
      expect(makeElection('ACTIVE').isRollLoadable()).toBe(false);
    });

    it('TS5: is false for CLOSED', () => {
      expect(makeElection('CLOSED').isRollLoadable()).toBe(false);
    });
  });

  describe('markAsPending', () => {
    function makeElection(currentStatus: string): ElectionEntity {
      return ElectionEntity.restore({
        id: 'election-1',
        name: 'n',
        description: 'd',
        startDate: new Date(Date.UTC(2026, 9, 1)),
        startTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        endDate: new Date(Date.UTC(2026, 9, 1)),
        endTime: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
        currentStatus: currentStatus as ElectionEntity['currentStatus'],
        blankVoteEnabled: false,
        createdAt: new Date('2026-08-19T15:00:00.000Z'),
      });
    }

    it('TS6: transitions CREATED to PENDING', () => {
      const e = makeElection('CREATED');
      e.markAsPending();
      expect(e.currentStatus).toBe('PENDING');
    });

    it('TS7: is a no-op when already PENDING', () => {
      const e = makeElection('PENDING');
      e.markAsPending();
      expect(e.currentStatus).toBe('PENDING');
    });

    it('TS8: throws ElectionStatusTransitionError on PUBLISHED', () => {
      const e = makeElection('PUBLISHED');
      expect(() => e.markAsPending()).toThrow(ElectionStatusTransitionError);
      expect(e.currentStatus).toBe('PUBLISHED');
    });

    it('TS9: throws ElectionStatusTransitionError on ACTIVE', () => {
      const e = makeElection('ACTIVE');
      expect(() => e.markAsPending()).toThrow(ElectionStatusTransitionError);
      expect(e.currentStatus).toBe('ACTIVE');
    });

    it('TS10: throws ElectionStatusTransitionError on CLOSED', () => {
      const e = makeElection('CLOSED');
      expect(() => e.markAsPending()).toThrow(ElectionStatusTransitionError);
      expect(e.currentStatus).toBe('CLOSED');
    });
  });

  describe('currentStatus getter (backward compatibility)', () => {
    it('TS11: exposes the status through the public getter after privatization', () => {
      const e = ElectionEntity.restore({
        id: 'election-1',
        name: 'n',
        description: 'd',
        startDate: new Date(Date.UTC(2026, 9, 1)),
        startTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        endDate: new Date(Date.UTC(2026, 9, 1)),
        endTime: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
        currentStatus: 'PENDING',
        blankVoteEnabled: false,
        createdAt: new Date('2026-08-19T15:00:00.000Z'),
      });
      expect(e.currentStatus).toBe('PENDING');
    });
  });
});
