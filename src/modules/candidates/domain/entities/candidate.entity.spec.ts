import { CandidateEntity } from './candidate.entity';

describe('CandidateEntity', () => {
  const baseInput = {
    firstName: 'Juan',
    lastName: 'Garcia',
    studentCode: '20201234',
    programCode: '1234',
    identificationNumber: '1000123456',
  };

  describe('create', () => {
    it('creates a candidate with ACTIVE status by default', () => {
      const entity = CandidateEntity.create(baseInput);

      expect(entity.status).toBe(CandidateEntity.DEFAULT_STATUS);
      expect(entity.status).toBe('ACTIVE');
    });

    it('does not assign id or createdAt (Prisma generates them)', () => {
      const entity = CandidateEntity.create(baseInput);

      expect(entity.id).toBeNull();
      expect(entity.createdAt).toBeNull();
    });

    it('trims whitespace from text fields', () => {
      const entity = CandidateEntity.create({
        firstName: '  Juan  ',
        lastName: '  Garcia ',
        studentCode: ' 20201234 ',
        programCode: ' 1234 ',
        identificationNumber: ' 1000123456 ',
      });

      expect(entity.firstName).toBe('Juan');
      expect(entity.lastName).toBe('Garcia');
      expect(entity.studentCode).toBe('20201234');
      expect(entity.programCode).toBe('1234');
      expect(entity.identificationNumber).toBe('1000123456');
    });

    it('honors an explicit status override', () => {
      const entity = CandidateEntity.create({ ...baseInput, status: 'SUSPENDED' });

      expect(entity.status).toBe('SUSPENDED');
    });
  });

  describe('restore', () => {
    it('rebuilds all fields including id and createdAt', () => {
      const createdAt = new Date('2026-08-19T15:00:00.000Z');
      const entity = CandidateEntity.restore({
        id: 'candidate-1',
        ...baseInput,
        status: 'ACTIVE',
        createdAt,
      });

      expect(entity.id).toBe('candidate-1');
      expect(entity.createdAt).toBe(createdAt);
      expect(entity.firstName).toBe('Juan');
      expect(entity.lastName).toBe('Garcia');
      expect(entity.studentCode).toBe('20201234');
      expect(entity.programCode).toBe('1234');
      expect(entity.identificationNumber).toBe('1000123456');
      expect(entity.status).toBe('ACTIVE');
    });

    it('preserves values without re-normalizing them', () => {
      const entity = CandidateEntity.restore({
        id: 'candidate-1',
        firstName: '  Juan  ',
        lastName: 'Garcia',
        studentCode: '20201234',
        programCode: '1234',
        identificationNumber: '1000123456',
        status: 'ACTIVE',
        createdAt: new Date('2026-08-19T15:00:00.000Z'),
      });

      expect(entity.firstName).toBe('  Juan  ');
      expect(entity.id).toBe('candidate-1');
      expect(entity.createdAt).not.toBeNull();
    });
  });

  describe('constants', () => {
    it('exposes the established DEFAULT_STATUS value', () => {
      expect(CandidateEntity.DEFAULT_STATUS).toBe('ACTIVE');
    });

    it('D4: exposes the established INACTIVE_STATUS value', () => {
      expect(CandidateEntity.INACTIVE_STATUS).toBe('INACTIVE');
    });
  });

  describe('deactivate', () => {
    function restoredCandidate(status: string): CandidateEntity {
      return CandidateEntity.restore({
        id: 'candidate-1',
        ...baseInput,
        status,
        createdAt: new Date('2026-08-19T15:00:00.000Z'),
      });
    }

    it('D1: changes status from ACTIVE to INACTIVE without modifying other fields', () => {
      const entity = restoredCandidate('ACTIVE');

      entity.deactivate();

      expect(entity.status).toBe(CandidateEntity.INACTIVE_STATUS);
      expect(entity.status).toBe('INACTIVE');
      expect(entity.id).toBe('candidate-1');
      expect(entity.firstName).toBe('Juan');
      expect(entity.lastName).toBe('Garcia');
      expect(entity.studentCode).toBe('20201234');
      expect(entity.programCode).toBe('1234');
      expect(entity.identificationNumber).toBe('1000123456');
      expect(entity.createdAt).toEqual(new Date('2026-08-19T15:00:00.000Z'));
    });

    it('D2: is a no-op on an already INACTIVE candidate without throwing', () => {
      const entity = restoredCandidate('INACTIVE');

      expect(() => entity.deactivate()).not.toThrow();

      expect(entity.status).toBe('INACTIVE');
    });

    it('D5: also marks a non-ACTIVE/non-INACTIVE status candidate INACTIVE', () => {
      const entity = restoredCandidate('SUSPENDED');

      entity.deactivate();

      expect(entity.status).toBe('INACTIVE');
    });
  });
});
