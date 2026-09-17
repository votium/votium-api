import { CandidateCompanionIncompleteError } from '../errors/candidate-companion-incomplete.error';
import { CandidateEntity } from './candidate.entity';

describe('CandidateEntity', () => {
  const baseInput = {
    firstName: 'Juan',
    lastName: 'Garcia',
    studentCode: '20201234',
    programCode: '1234',
    identificationNumber: '1000123456',
  };

  const companionSet = {
    companionFirstName: 'Maria',
    companionLastName: 'Lopez',
    companionStudentCode: '20209999',
    companionProgramCode: '9999',
    companionIdentification: '2000000000',
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

    it('C-01: populates all companion fields when the full companion set is provided', () => {
      const entity = CandidateEntity.create({ ...baseInput, ...companionSet });

      expect(entity.companionFirstName).toBe('Maria');
      expect(entity.companionLastName).toBe('Lopez');
      expect(entity.companionStudentCode).toBe('20209999');
      expect(entity.companionProgramCode).toBe('9999');
      expect(entity.companionIdentification).toBe('2000000000');
    });

    it('C-02: trims whitespace from every companion value', () => {
      const entity = CandidateEntity.create({
        ...baseInput,
        companionFirstName: '  Maria  ',
        companionLastName: '  Lopez ',
        companionStudentCode: ' 20209999 ',
        companionProgramCode: ' 9999 ',
        companionIdentification: ' 2000000000 ',
      });

      expect(entity.companionFirstName).toBe('Maria');
      expect(entity.companionLastName).toBe('Lopez');
      expect(entity.companionStudentCode).toBe('20209999');
      expect(entity.companionProgramCode).toBe('9999');
      expect(entity.companionIdentification).toBe('2000000000');
    });

    it('C-03: leaves all companion fields null when no companion is provided', () => {
      const entity = CandidateEntity.create(baseInput);

      expect(entity.companionFirstName).toBeNull();
      expect(entity.companionLastName).toBeNull();
      expect(entity.companionStudentCode).toBeNull();
      expect(entity.companionProgramCode).toBeNull();
      expect(entity.companionIdentification).toBeNull();
    });

    it.each([
      ['companionFirstName'],
      ['companionLastName'],
      ['companionStudentCode'],
      ['companionProgramCode'],
      ['companionIdentification'],
    ] as const)(
      'C-04: throws CandidateCompanionIncompleteError when only %s is provided',
      (field) => {
        expect(() =>
          CandidateEntity.create({ ...baseInput, [field]: companionSet[field] }),
        ).toThrow(CandidateCompanionIncompleteError);
      },
    );

    it('C-05: throws CandidateCompanionIncompleteError when only 4 of 5 companion fields are provided', () => {
      const { companionIdentification: _omitted, ...partialCompanion } = companionSet;

      expect(() => CandidateEntity.create({ ...baseInput, ...partialCompanion })).toThrow(
        CandidateCompanionIncompleteError,
      );
    });

    it('C-08: treats all explicit null companion values as absent (no error)', () => {
      const entity = CandidateEntity.create({
        ...baseInput,
        companionFirstName: null,
        companionLastName: null,
        companionStudentCode: null,
        companionProgramCode: null,
        companionIdentification: null,
      });

      expect(entity.companionFirstName).toBeNull();
      expect(entity.companionLastName).toBeNull();
      expect(entity.companionStudentCode).toBeNull();
      expect(entity.companionProgramCode).toBeNull();
      expect(entity.companionIdentification).toBeNull();
    });

    it('C-09: throws CandidateCompanionIncompleteError when 4 values and 1 null are provided', () => {
      expect(() =>
        CandidateEntity.create({
          ...baseInput,
          companionFirstName: 'Maria',
          companionLastName: 'Lopez',
          companionStudentCode: '20209999',
          companionProgramCode: '9999',
          companionIdentification: null,
        }),
      ).toThrow(CandidateCompanionIncompleteError);
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
        companionFirstName: null,
        companionLastName: null,
        companionStudentCode: null,
        companionProgramCode: null,
        companionIdentification: null,
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
        companionFirstName: null,
        companionLastName: null,
        companionStudentCode: null,
        companionProgramCode: null,
        companionIdentification: null,
      });

      expect(entity.firstName).toBe('  Juan  ');
      expect(entity.id).toBe('candidate-1');
      expect(entity.createdAt).not.toBeNull();
    });

    it('C-06: preserves companion values without re-normalizing them', () => {
      const entity = CandidateEntity.restore({
        id: 'candidate-1',
        ...baseInput,
        status: 'ACTIVE',
        createdAt: new Date('2026-08-19T15:00:00.000Z'),
        companionFirstName: '  Maria  ',
        companionLastName: 'Lopez',
        companionStudentCode: '20209999',
        companionProgramCode: '9999',
        companionIdentification: '2000000000',
      });

      expect(entity.companionFirstName).toBe('  Maria  ');
      expect(entity.companionLastName).toBe('Lopez');
      expect(entity.companionStudentCode).toBe('20209999');
      expect(entity.companionProgramCode).toBe('9999');
      expect(entity.companionIdentification).toBe('2000000000');
    });

    it('C-07: preserves null companion fields', () => {
      const entity = CandidateEntity.restore({
        id: 'candidate-1',
        ...baseInput,
        status: 'ACTIVE',
        createdAt: new Date('2026-08-19T15:00:00.000Z'),
        companionFirstName: null,
        companionLastName: null,
        companionStudentCode: null,
        companionProgramCode: null,
        companionIdentification: null,
      });

      expect(entity.companionFirstName).toBeNull();
      expect(entity.companionLastName).toBeNull();
      expect(entity.companionStudentCode).toBeNull();
      expect(entity.companionProgramCode).toBeNull();
      expect(entity.companionIdentification).toBeNull();
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
        companionFirstName: 'Maria',
        companionLastName: 'Lopez',
        companionStudentCode: '20209999',
        companionProgramCode: '9999',
        companionIdentification: '2000000000',
      });

      entity.deactivate();

      expect(entity.id).toBe('candidate-1');
      expect(entity.firstName).toBe('Juan');
      expect(entity.lastName).toBe('Garcia');
      expect(entity.studentCode).toBe('20201234');
      expect(entity.programCode).toBe('1234');
      expect(entity.identificationNumber).toBe('1000123456');
      expect(entity.companionFirstName).toBe('Maria');
      expect(entity.companionLastName).toBe('Lopez');
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
        companionFirstName: null,
        companionLastName: null,
        companionStudentCode: null,
        companionProgramCode: null,
        companionIdentification: null,
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
        companionFirstName: null,
        companionLastName: null,
        companionStudentCode: null,
        companionProgramCode: null,
        companionIdentification: null,
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

  describe('deletedAt / isDeleted / delete', () => {
    const deletionDate = new Date('2026-09-01T10:00:00.000Z');

    function restored(overrides: Partial<Parameters<typeof CandidateEntity.restore>[0]> = {}) {
      return CandidateEntity.restore({
        id: 'candidate-1',
        ...baseInput,
        status: 'ACTIVE',
        createdAt: new Date('2026-08-19T15:00:00.000Z'),
        companionFirstName: null,
        companionLastName: null,
        companionStudentCode: null,
        companionProgramCode: null,
        companionIdentification: null,
        ...overrides,
      });
    }

    it('CDE-1: create() does not mark the candidate as deleted', () => {
      const entity = CandidateEntity.create(baseInput);

      expect(entity.deletedAt).toBeNull();
      expect(entity.isDeleted()).toBe(false);
    });

    it('CDE-2: delete(fecha) marks the deletion with the received date', () => {
      const entity = restored();

      entity.delete(deletionDate);

      expect(entity.deletedAt).toEqual(deletionDate);
      expect(entity.isDeleted()).toBe(true);
    });

    it('CDE-3: delete() does not change status', () => {
      const active = restored();
      const inactive = restored({ status: CandidateEntity.INACTIVE_STATUS });

      active.delete(deletionDate);
      inactive.delete(deletionDate);

      expect(active.status).toBe('ACTIVE');
      expect(inactive.status).toBe('INACTIVE');
    });

    it('CDE-4: delete() does not alter any other field', () => {
      const createdAt = new Date('2026-08-19T15:00:00.000Z');
      const entity = restored({ ...companionSet, createdAt });

      entity.delete(deletionDate);

      expect(entity.id).toBe('candidate-1');
      expect(entity.firstName).toBe('Juan');
      expect(entity.lastName).toBe('Garcia');
      expect(entity.studentCode).toBe('20201234');
      expect(entity.programCode).toBe('1234');
      expect(entity.identificationNumber).toBe('1000123456');
      expect(entity.companionFirstName).toBe('Maria');
      expect(entity.companionLastName).toBe('Lopez');
      expect(entity.companionStudentCode).toBe('20209999');
      expect(entity.companionProgramCode).toBe('9999');
      expect(entity.companionIdentification).toBe('2000000000');
      expect(entity.createdAt).toEqual(createdAt);
    });

    it('CDE-5: restore({ deletedAt }) hydrates the deletion', () => {
      const entity = restored({ deletedAt: deletionDate });

      expect(entity.deletedAt).toEqual(deletionDate);
      expect(entity.isDeleted()).toBe(true);
    });

    it('CDE-6: restore({ deletedAt: null }) hydrates a non-deleted candidate', () => {
      const entity = restored({ deletedAt: null });

      expect(entity.deletedAt).toBeNull();
      expect(entity.isDeleted()).toBe(false);
    });

    it('CDE-7: delete() defaults to the current date', () => {
      const before = new Date();
      const entity = restored();

      entity.delete();

      expect(entity.deletedAt).toBeInstanceOf(Date);
      expect((entity.deletedAt as Date).getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect((entity.deletedAt as Date).getTime()).toBeLessThanOrEqual(Date.now());
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
        companionFirstName: null,
        companionLastName: null,
        companionStudentCode: null,
        companionProgramCode: null,
        companionIdentification: null,
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
        companionFirstName: null,
        companionLastName: null,
        companionStudentCode: null,
        companionProgramCode: null,
        companionIdentification: null,
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
        companionFirstName: null,
        companionLastName: null,
        companionStudentCode: null,
        companionProgramCode: null,
        companionIdentification: null,
      });

      entity.update({ firstName: 'Changed' });

      expect(entity.firstName).toBe('Changed');
      expect(entity.status).toBe('INACTIVE');
    });

    it.each([['firstName'], ['lastName'], ['programCode'], ['identificationNumber']] as const)(
      'D-11: explicit null on base field %s is ignored (field unchanged)',
      (field) => {
        const entity = restored();

        entity.update({ [field]: null });

        expect(entity[field]).toBe(
          field === 'firstName'
            ? 'Juan'
            : field === 'lastName'
              ? 'Garcia'
              : field === 'programCode'
                ? '1234'
                : '1000123456',
        );
      },
    );

    it.each([
      ['companionFirstName', 'NewFirstName'],
      ['companionLastName', 'NewLastName'],
      ['companionStudentCode', 'NewStudentCode'],
      ['companionProgramCode', 'NewProgramCode'],
      ['companionIdentification', 'NewIdentification'],
    ])('R-01: partial update only changes %s', (field, value) => {
      const entity = restored();

      entity.update({ [field]: value });

      expect(entity[field]).toBe(value);
      expect(entity.companionFirstName).toBe(field === 'companionFirstName' ? value : null);
      expect(entity.companionLastName).toBe(field === 'companionLastName' ? value : null);
      expect(entity.companionStudentCode).toBe(field === 'companionStudentCode' ? value : null);
      expect(entity.companionProgramCode).toBe(field === 'companionProgramCode' ? value : null);
      expect(entity.companionIdentification).toBe(
        field === 'companionIdentification' ? value : null,
      );
    });

    it('R-02: leaves all companion fields untouched when companion fields are omitted', () => {
      const entity = CandidateEntity.restore({
        id: 'candidate-1',
        ...baseInput,
        status: 'ACTIVE',
        createdAt: new Date('2026-08-19T15:00:00.000Z'),
        ...companionSet,
      });

      entity.update({ firstName: 'Changed' });

      expect(entity.companionFirstName).toBe('Maria');
      expect(entity.companionLastName).toBe('Lopez');
      expect(entity.companionStudentCode).toBe('20209999');
      expect(entity.companionProgramCode).toBe('9999');
      expect(entity.companionIdentification).toBe('2000000000');
    });

    it('R-03: trims whitespace from assigned companion values', () => {
      const entity = restored();

      entity.update({ companionFirstName: '  Maria  ' });

      expect(entity.companionFirstName).toBe('Maria');
    });

    it('R-04: companion-only update does not modify id, studentCode, status or createdAt', () => {
      const entity = restored();

      entity.update({ companionFirstName: 'Maria' });

      expect(entity.id).toBe('candidate-1');
      expect(entity.studentCode).toBe('20201234');
      expect(entity.status).toBe('ACTIVE');
      expect(entity.createdAt?.toISOString()).toBe('2026-08-19T15:00:00.000Z');
    });

    it.each([
      ['companionFirstName'],
      ['companionLastName'],
      ['companionStudentCode'],
      ['companionProgramCode'],
      ['companionIdentification'],
    ] as const)(
      'R-05: explicit null on companion field %s is ignored (value preserved)',
      (field) => {
        const entity = CandidateEntity.restore({
          id: 'candidate-1',
          ...baseInput,
          status: 'ACTIVE',
          createdAt: new Date('2026-08-19T15:00:00.000Z'),
          ...companionSet,
        });

        entity.update({ [field]: null });

        expect(entity[field]).toBe(companionSet[field]);
      },
    );

    it('R-06: a null companion value does not block other fields from being updated', () => {
      const entity = restored();

      entity.update({ firstName: 'ChangedBase', companionFirstName: null });

      expect(entity.firstName).toBe('ChangedBase');
      expect(entity.companionFirstName).toBeNull();
    });
  });
});
