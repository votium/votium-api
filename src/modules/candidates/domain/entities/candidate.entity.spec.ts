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

  describe('deactivate', () => {
    it('marks an ACTIVE candidate as INACTIVE', () => {
      const entity = CandidateEntity.create(baseInput);

      expect(entity.status).toBe(CandidateEntity.DEFAULT_STATUS);

      entity.deactivate();

      expect(entity.status).toBe(CandidateEntity.INACTIVE_STATUS);
      expect(entity.status).toBe('INACTIVE');
    });

    it('does not modify any other field', () => {
      const createdAt = new Date('2026-08-19T15:00:00.000Z');
      const entity = CandidateEntity.restore({
        id: 'candidate-1',
        firstName: 'Juan',
        lastName: 'Garcia',
        studentCode: '20201234',
        programCode: '1234',
        identificationNumber: '1000123456',
        status: 'ACTIVE',
        createdAt,
      });

      entity.deactivate();

      expect(entity.id).toBe('candidate-1');
      expect(entity.firstName).toBe('Juan');
      expect(entity.lastName).toBe('Garcia');
      expect(entity.studentCode).toBe('20201234');
      expect(entity.programCode).toBe('1234');
      expect(entity.identificationNumber).toBe('1000123456');
      expect(entity.createdAt).toBe(createdAt);
    });
  });

  describe('reactivate', () => {
    it('marks an INACTIVE candidate as ACTIVE', () => {
      const entity = CandidateEntity.restore({
        id: 'candidate-1',
        firstName: 'Juan',
        lastName: 'Garcia',
        studentCode: '20201234',
        programCode: '1234',
        identificationNumber: '1000123456',
        status: CandidateEntity.INACTIVE_STATUS,
        createdAt: new Date('2026-08-19T15:00:00.000Z'),
      });

      expect(entity.status).toBe(CandidateEntity.INACTIVE_STATUS);

      entity.reactivate();

      expect(entity.status).toBe(CandidateEntity.DEFAULT_STATUS);
      expect(entity.status).toBe('ACTIVE');
    });

    it('does not modify any other field', () => {
      const createdAt = new Date('2026-08-19T15:00:00.000Z');
      const entity = CandidateEntity.restore({
        id: 'candidate-1',
        firstName: 'Juan',
        lastName: 'Garcia',
        studentCode: '20201234',
        programCode: '1234',
        identificationNumber: '1000123456',
        status: CandidateEntity.INACTIVE_STATUS,
        createdAt,
      });

      entity.reactivate();

      expect(entity.id).toBe('candidate-1');
      expect(entity.firstName).toBe('Juan');
      expect(entity.lastName).toBe('Garcia');
      expect(entity.studentCode).toBe('20201234');
      expect(entity.programCode).toBe('1234');
      expect(entity.identificationNumber).toBe('1000123456');
      expect(entity.createdAt?.toISOString()).toBe(createdAt.toISOString());
    });
  });

  describe('constants', () => {
    it('exposes the established DEFAULT_STATUS value', () => {
      expect(CandidateEntity.DEFAULT_STATUS).toBe('ACTIVE');
    });

    it('exposes the established INACTIVE_STATUS value', () => {
      expect(CandidateEntity.INACTIVE_STATUS).toBe('INACTIVE');
    });
  });

  describe('update', () => {
    function restored(): CandidateEntity {
      return CandidateEntity.restore({
        id: 'candidate-1',
        firstName: 'Juan',
        lastName: 'Garcia',
        studentCode: '20201234',
        programCode: '1234',
        identificationNumber: '1000123456',
        status: 'ACTIVE',
        createdAt: new Date('2026-08-19T15:00:00.000Z'),
      });
    }

    it('D-01: updates all editable fields with trimmed values', () => {
      const entity = restored();

      entity.update({
        firstName: '  Maria  ',
        lastName: '  Lopez ',
        programCode: ' 2710 ',
        identificationNumber: ' 2000000000 ',
      });

      expect(entity.firstName).toBe('Maria');
      expect(entity.lastName).toBe('Lopez');
      expect(entity.programCode).toBe('2710');
      expect(entity.identificationNumber).toBe('2000000000');
    });

    it('D-02: partial update only changes firstName', () => {
      const entity = restored();

      entity.update({ firstName: 'OnlyFirst' });

      expect(entity.firstName).toBe('OnlyFirst');
      expect(entity.lastName).toBe('Garcia');
      expect(entity.programCode).toBe('1234');
      expect(entity.identificationNumber).toBe('1000123456');
    });

    it('D-03: partial update only changes identificationNumber', () => {
      const entity = restored();

      entity.update({ identificationNumber: '2000000000' });

      expect(entity.firstName).toBe('Juan');
      expect(entity.lastName).toBe('Garcia');
      expect(entity.programCode).toBe('1234');
      expect(entity.identificationNumber).toBe('2000000000');
    });

    it('D-04: trims whitespace before assignment', () => {
      const entity = restored();

      entity.update({ firstName: '  Juan  ' });

      expect(entity.firstName).toBe('Juan');
    });

    it('D-05: leaves omitted fields untouched (empty string is assigned as-is after trim)', () => {
      const entity = restored();

      entity.update({ firstName: '' });

      expect(entity.firstName).toBe('');
      expect(entity.lastName).toBe('Garcia');
    });

    it('D-06: does not modify the immutable id', () => {
      const entity = restored();

      entity.update({ firstName: 'X' });

      expect(entity.id).toBe('candidate-1');
    });

    it('D-07: does not modify the immutable studentCode', () => {
      const entity = restored();

      entity.update({ firstName: 'X' });

      expect(entity.studentCode).toBe('20201234');
    });

    it('D-08: does not modify the immutable status', () => {
      const active = restored();
      const inactive = CandidateEntity.restore({
        id: 'candidate-2',
        firstName: 'Ana',
        lastName: 'Rojas',
        studentCode: '20209999',
        programCode: '0000',
        identificationNumber: '1000999999',
        status: 'INACTIVE',
        createdAt: new Date('2026-08-19T15:00:00.000Z'),
      });

      active.update({ firstName: 'X' });
      inactive.update({ firstName: 'Y' });

      expect(active.status).toBe('ACTIVE');
      expect(inactive.status).toBe('INACTIVE');
    });

    it('D-09: does not modify the immutable createdAt', () => {
      const createdAt = new Date('2026-08-19T15:00:00.000Z');
      const entity = restored();

      entity.update({ firstName: 'X' });

      expect(entity.createdAt?.toISOString()).toBe(createdAt.toISOString());
    });

    it('D-10: allows update on a logically deleted candidate at the entity level', () => {
      const entity = CandidateEntity.restore({
        id: 'candidate-2',
        firstName: 'Ana',
        lastName: 'Rojas',
        studentCode: '20209999',
        programCode: '0000',
        identificationNumber: '1000999999',
        status: 'INACTIVE',
        createdAt: new Date('2026-08-19T15:00:00.000Z'),
      });

      entity.update({ firstName: 'Changed' });

      expect(entity.firstName).toBe('Changed');
      expect(entity.status).toBe('INACTIVE');
    });
  });
});
