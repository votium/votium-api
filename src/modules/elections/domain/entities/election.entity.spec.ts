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

  describe('isRollModifiable', () => {
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

    it('TM1: is true for PENDING', () => {
      expect(makeElection('PENDING').isRollModifiable()).toBe(true);
    });

    it('TM2: is false for CREATED', () => {
      expect(makeElection('CREATED').isRollModifiable()).toBe(false);
    });

    it('TM3: is false for PUBLISHED', () => {
      expect(makeElection('PUBLISHED').isRollModifiable()).toBe(false);
    });

    it('TM4: is false for ACTIVE', () => {
      expect(makeElection('ACTIVE').isRollModifiable()).toBe(false);
    });

    it('TM5: is false for CLOSED', () => {
      expect(makeElection('CLOSED').isRollModifiable()).toBe(false);
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

  describe('markAsActive', () => {
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

    it('MAA-1: transitions a PENDING election to ACTIVE', () => {
      const e = makeElection('PENDING');
      e.markAsActive();
      expect(e.currentStatus).toBe('ACTIVE');
    });

    it('MAA-2: throws ElectionStatusTransitionError on CREATED and leaves it unchanged', () => {
      const e = makeElection('CREATED');
      expect(() => e.markAsActive()).toThrow(ElectionStatusTransitionError);
      expect(e.currentStatus).toBe('CREATED');
    });

    it('MAA-3: throws ElectionStatusTransitionError on PUBLISHED and leaves it unchanged', () => {
      const e = makeElection('PUBLISHED');
      expect(() => e.markAsActive()).toThrow(ElectionStatusTransitionError);
      expect(e.currentStatus).toBe('PUBLISHED');
    });

    it('MAA-4: throws ElectionStatusTransitionError on CLOSED and leaves it unchanged', () => {
      const e = makeElection('CLOSED');
      expect(() => e.markAsActive()).toThrow(ElectionStatusTransitionError);
      expect(e.currentStatus).toBe('CLOSED');
    });

    it('MAA-5: throws ElectionStatusTransitionError on ACTIVE (no silent restarts)', () => {
      const e = makeElection('ACTIVE');
      expect(() => e.markAsActive()).toThrow(ElectionStatusTransitionError);
      expect(e.currentStatus).toBe('ACTIVE');
    });
  });

  describe('markAsClosed', () => {
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

    it('MAC-1: transitions an ACTIVE election to CLOSED', () => {
      const e = makeElection('ACTIVE');
      e.markAsClosed();
      expect(e.currentStatus).toBe('CLOSED');
    });

    it.each(['CREATED', 'PENDING', 'PUBLISHED', 'CLOSED'] as const)(
      'MAC-2: throws ElectionStatusTransitionError on %s and leaves it unchanged',
      (status) => {
        const e = makeElection(status);
        expect(() => e.markAsClosed()).toThrow(ElectionStatusTransitionError);
        expect(e.currentStatus).toBe(status);
      },
    );
  });

  describe('isWithinSchedule', () => {
    // Window: 2026-10-01 08:00:00Z .. 2026-10-01 18:00:00Z.
    function makeElection(
      over: Partial<Parameters<typeof ElectionEntity.restore>[0]> = {},
    ): ElectionEntity {
      return ElectionEntity.restore({
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
        ...over,
      });
    }

    it('WS-1: returns true for a now strictly inside the window', () => {
      expect(makeElection().isWithinSchedule(new Date(Date.UTC(2026, 9, 1, 12, 0, 0)))).toBe(true);
    });

    it('WS-2: returns false one second before the start instant', () => {
      expect(makeElection().isWithinSchedule(new Date(Date.UTC(2026, 9, 1, 7, 59, 59)))).toBe(
        false,
      );
    });

    it('WS-3: returns false one second after the end instant', () => {
      expect(makeElection().isWithinSchedule(new Date(Date.UTC(2026, 9, 1, 18, 0, 1)))).toBe(false);
    });

    it('WS-4: returns true exactly at the start instant (start boundary inclusive)', () => {
      expect(makeElection().isWithinSchedule(new Date(Date.UTC(2026, 9, 1, 8, 0, 0)))).toBe(true);
    });

    it('WS-5: returns true exactly at the end instant (end boundary inclusive)', () => {
      expect(makeElection().isWithinSchedule(new Date(Date.UTC(2026, 9, 1, 18, 0, 0)))).toBe(true);
    });

    it('WS-6: combines date and time across different calendar days (multi-day window)', () => {
      const e = makeElection({
        startDate: new Date(Date.UTC(2026, 9, 30)),
        startTime: new Date(Date.UTC(1970, 0, 1, 22, 0, 0)),
        endDate: new Date(Date.UTC(2026, 10, 1)),
        endTime: new Date(Date.UTC(1970, 0, 1, 2, 0, 0)),
      });
      // Inside the overnight window 2026-09-30T22:00:00Z .. 2026-10-01T02:00:00Z.
      expect(e.isWithinSchedule(new Date(Date.UTC(2026, 9, 30, 23, 30, 0)))).toBe(true);
      // One second before the start instant.
      expect(e.isWithinSchedule(new Date(Date.UTC(2026, 9, 30, 21, 59, 59)))).toBe(false);
      // One second after the end instant.
      expect(e.isWithinSchedule(new Date(Date.UTC(2026, 10, 1, 2, 0, 1)))).toBe(false);
    });

    it('WS-7: multi-day end boundary is inclusive', () => {
      const e = makeElection({
        startDate: new Date(Date.UTC(2026, 9, 30)),
        startTime: new Date(Date.UTC(1970, 0, 1, 22, 0, 0)),
        endDate: new Date(Date.UTC(2026, 10, 1)),
        endTime: new Date(Date.UTC(1970, 0, 1, 2, 0, 0)),
      });
      expect(e.isWithinSchedule(new Date(Date.UTC(2026, 10, 1, 2, 0, 0)))).toBe(true);
    });
  });

  describe('hasReachedEnd', () => {
    // End instant: 2026-10-01 18:00:00Z unless overridden.
    function makeElection(
      over: Partial<Parameters<typeof ElectionEntity.restore>[0]> = {},
    ): ElectionEntity {
      return ElectionEntity.restore({
        id: 'election-1',
        name: 'n',
        description: 'd',
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

    it('HRE-1: returns false one second before the end instant', () => {
      expect(makeElection().hasReachedEnd(new Date(Date.UTC(2026, 9, 1, 17, 59, 59)))).toBe(false);
    });

    it('HRE-2: returns true exactly at the end instant (inclusive >= boundary)', () => {
      expect(makeElection().hasReachedEnd(new Date(Date.UTC(2026, 9, 1, 18, 0, 0)))).toBe(true);
    });

    it('HRE-3: returns true after the end instant (delayed scheduler execution)', () => {
      expect(makeElection().hasReachedEnd(new Date(Date.UTC(2026, 9, 1, 18, 0, 5)))).toBe(true);
    });

    it('HRE-4: returns false earlier the same day (date and time combined, not date-only)', () => {
      expect(makeElection().hasReachedEnd(new Date(Date.UTC(2026, 9, 1, 7, 0, 0)))).toBe(false);
    });

    it('HRE-5: returns false when the end date is still in the future', () => {
      const e = makeElection({ endDate: new Date(Date.UTC(2026, 9, 2)) });
      expect(e.hasReachedEnd(new Date(Date.UTC(2026, 9, 1, 23, 0, 0)))).toBe(false);
    });

    it('HRE-6: returns true when the end fell on a previous day (downtime across midnight)', () => {
      const e = makeElection({
        endDate: new Date(Date.UTC(2026, 8, 30)),
        endTime: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
      });
      expect(e.hasReachedEnd(new Date(Date.UTC(2026, 9, 1, 0, 0, 30)))).toBe(true);
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
