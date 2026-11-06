import { ElectorAlreadyInactiveError } from '../errors/elector-already-inactive.error';
import { ELECTOR_STATUSES, ElectorEntity } from './elector.entity';

describe('ElectorEntity', () => {
  const baseInput = {
    firstName: 'Juan Camilo',
    lastName: 'Garcia Saenz',
    email: 'juan.garcia@correounivalle.edu.co',
    passwordHash: 'pbkdf2$210000$salt$hash',
    studentCode: '202012345',
    programCode: '2710',
  };

  describe('create', () => {
    it('creates an elector with ACTIVE status by default', () => {
      const entity = ElectorEntity.create(baseInput);

      expect(entity.status).toBe(ElectorEntity.DEFAULT_STATUS);
      expect(entity.status).toBe('ACTIVE');
    });

    it('does not assign id or createdAt (Prisma generates them)', () => {
      const entity = ElectorEntity.create(baseInput);

      expect(entity.id).toBeNull();
      expect(entity.createdAt).toBeNull();
    });

    it('trims whitespace from text fields', () => {
      const entity = ElectorEntity.create({
        ...baseInput,
        firstName: '  Juan Camilo  ',
        lastName: '  Garcia Saenz ',
        email: '  juan.garcia@correounivalle.edu.co ',
        studentCode: ' 202012345 ',
        programCode: ' 2710 ',
      });

      expect(entity.firstName).toBe('Juan Camilo');
      expect(entity.lastName).toBe('Garcia Saenz');
      expect(entity.email).toBe('juan.garcia@correounivalle.edu.co');
      expect(entity.studentCode).toBe('202012345');
      expect(entity.programCode).toBe('2710');
    });

    it('keeps the provided passwordHash verbatim', () => {
      const entity = ElectorEntity.create(baseInput);

      expect(entity.passwordHash).toBe('pbkdf2$210000$salt$hash');
    });

    it('honors an explicit status override', () => {
      const entity = ElectorEntity.create({ ...baseInput, status: 'SUSPENDED' });

      expect(entity.status).toBe('SUSPENDED');
    });
  });

  describe('restore', () => {
    it('rebuilds all fields including id and createdAt', () => {
      const createdAt = new Date('2026-08-01T00:00:00.000Z');
      const updatedAt = new Date('2026-08-02T00:00:00.000Z');
      const entity = ElectorEntity.restore({
        id: 'elector-1',
        ...baseInput,
        identification: '1001234567',
        status: 'ACTIVE',
        createdAt,
        updatedAt,
      });

      expect(entity.id).toBe('elector-1');
      expect(entity.createdAt).toBe(createdAt);
      expect(entity.updatedAt).toBe(updatedAt);
      expect(entity.identification).toBe('1001234567');
      expect(entity.firstName).toBe('Juan Camilo');
      expect(entity.lastName).toBe('Garcia Saenz');
      expect(entity.email).toBe('juan.garcia@correounivalle.edu.co');
      expect(entity.passwordHash).toBe('pbkdf2$210000$salt$hash');
      expect(entity.studentCode).toBe('202012345');
      expect(entity.programCode).toBe('2710');
      expect(entity.status).toBe('ACTIVE');
    });

    it('E-ID-04: restore passes through identification and updatedAt', () => {
      const updatedAt = new Date('2026-08-02T00:00:00.000Z');
      const entity = ElectorEntity.restore({
        id: 'elector-1',
        ...baseInput,
        identification: '1001234567',
        status: 'ACTIVE',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt,
      });

      expect(entity.identification).toBe('1001234567');
      expect(entity.updatedAt).toEqual(updatedAt);
    });

    it('E-ID-05: restore accepts null identification and updatedAt', () => {
      const entity = ElectorEntity.restore({
        id: 'elector-1',
        ...baseInput,
        identification: null,
        status: 'ACTIVE',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: null,
      });

      expect(entity.identification).toBeNull();
      expect(entity.updatedAt).toBeNull();
    });

    it('preserves values without re-normalizing them', () => {
      const entity = ElectorEntity.restore({
        id: 'elector-1',
        firstName: '  Juan  ',
        lastName: 'Garcia',
        email: 'Juan.Garcia@Example.COM',
        passwordHash: 'hash',
        studentCode: '202012345',
        programCode: '2710',
        identification: null,
        status: 'ACTIVE',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: null,
      });

      expect(entity.firstName).toBe('  Juan  ');
      expect(entity.email).toBe('Juan.Garcia@Example.COM');
    });
  });

  describe('isActive', () => {
    it('returns true when the status is ACTIVE', () => {
      const entity = ElectorEntity.create(baseInput);

      expect(entity.isActive()).toBe(true);
    });

    it('returns false when the status is INACTIVE', () => {
      const entity = ElectorEntity.restore({
        id: 'elector-1',
        ...baseInput,
        identification: null,
        status: 'INACTIVE',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: null,
      });

      expect(entity.isActive()).toBe(false);
    });

    it('returns false for any other status', () => {
      const entity = ElectorEntity.create({ ...baseInput, status: 'SUSPENDED' });

      expect(entity.isActive()).toBe(false);
    });
  });

  describe('deactivate', () => {
    it('D1: changes status from ACTIVE to INACTIVE without modifying other fields', () => {
      const createdAt = new Date('2026-08-01T00:00:00.000Z');
      const entity = ElectorEntity.restore({
        id: 'elector-1',
        ...baseInput,
        identification: null,
        status: 'ACTIVE',
        createdAt,
        updatedAt: createdAt,
      });

      entity.deactivate();

      expect(entity.status).toBe(ElectorEntity.INACTIVE_STATUS);
      expect(entity.status).toBe('INACTIVE');
      expect(entity.id).toBe('elector-1');
      expect(entity.firstName).toBe('Juan Camilo');
      expect(entity.lastName).toBe('Garcia Saenz');
      expect(entity.email).toBe('juan.garcia@correounivalle.edu.co');
      expect(entity.passwordHash).toBe('pbkdf2$210000$salt$hash');
      expect(entity.studentCode).toBe('202012345');
      expect(entity.programCode).toBe('2710');
      expect(entity.createdAt).toBe(createdAt);
    });

    it('D2: throws ElectorAlreadyInactiveError when already inactive', () => {
      const entity = ElectorEntity.restore({
        id: 'elector-1',
        ...baseInput,
        identification: null,
        status: 'INACTIVE',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: null,
      });

      expect(() => entity.deactivate()).toThrow(ElectorAlreadyInactiveError);
      expect(entity.status).toBe('INACTIVE');
    });

    it('D3: exposes the shared INACTIVE status constant after restore', () => {
      const entity = ElectorEntity.restore({
        id: 'elector-1',
        ...baseInput,
        identification: null,
        status: 'INACTIVE',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: null,
      });

      expect(entity.status).toBe(ElectorEntity.INACTIVE_STATUS);
    });
  });

  describe('identification / updatedAt', () => {
    it('E-ID-01: create() defaults identification and updatedAt to null', () => {
      const entity = ElectorEntity.create(baseInput);

      expect(entity.identification).toBeNull();
      expect(entity.updatedAt).toBeNull();
    });

    it('E-ID-02: create() trims the identification', () => {
      const entity = ElectorEntity.create({ ...baseInput, identification: '  1001234567  ' });

      expect(entity.identification).toBe('1001234567');
    });

    it('E-ID-03: create() stores an empty-string identification as null', () => {
      expect(ElectorEntity.create({ ...baseInput, identification: '' }).identification).toBeNull();
      expect(
        ElectorEntity.create({ ...baseInput, identification: '   ' }).identification,
      ).toBeNull();
    });

    it('E-ID-06: update() trims identification when provided', () => {
      const entity = restoredEntity();

      entity.update({ identification: ' 99 ' });

      expect(entity.identification).toBe('99');
    });

    it('E-ID-07: update() keeps identification when omitted', () => {
      const entity = ElectorEntity.restore({
        id: 'elector-1',
        ...baseInput,
        identification: '1001234567',
        status: 'ACTIVE',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: null,
      });

      entity.update({ firstName: 'X' });

      expect(entity.identification).toBe('1001234567');
    });

    it('E-ID-08: update() never sets updatedAt from the input', () => {
      const updatedAt = new Date('2026-08-02T00:00:00.000Z');
      const entity = ElectorEntity.restore({
        id: 'elector-1',
        ...baseInput,
        identification: null,
        status: 'ACTIVE',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt,
      });

      entity.update({ firstName: 'Maria', identification: '99' });

      expect(entity.updatedAt).toEqual(updatedAt);
    });

    it('E-ID-09: exposes the ELECTOR_STATUSES constant', () => {
      expect(ELECTOR_STATUSES).toEqual(['ACTIVE', 'INACTIVE']);
    });

    function restoredEntity() {
      return ElectorEntity.restore({
        id: 'elector-1',
        ...baseInput,
        identification: null,
        status: 'ACTIVE',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: null,
      });
    }
  });

  describe('update', () => {
    function restoredEntity() {
      return ElectorEntity.restore({
        id: 'elector-1',
        ...baseInput,
        identification: null,
        status: 'ACTIVE',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: null,
      });
    }

    it('EU1: updates only the provided fields', () => {
      const entity = restoredEntity();

      entity.update({ firstName: 'Maria', studentCode: '202099999' });

      expect(entity.firstName).toBe('Maria');
      expect(entity.studentCode).toBe('202099999');
      expect(entity.lastName).toBe('Garcia Saenz');
      expect(entity.email).toBe('juan.garcia@correounivalle.edu.co');
      expect(entity.programCode).toBe('2710');
    });

    it('EU2: trims whitespace on updated fields', () => {
      const entity = restoredEntity();

      entity.update({
        firstName: '  Maria  ',
        lastName: ' Rodriguez ',
        email: '  maria@example.com ',
        studentCode: ' 202099999 ',
        programCode: ' 2710 ',
      });

      expect(entity.firstName).toBe('Maria');
      expect(entity.lastName).toBe('Rodriguez');
      expect(entity.email).toBe('maria@example.com');
      expect(entity.studentCode).toBe('202099999');
      expect(entity.programCode).toBe('2710');
    });

    it('EU3: leaves unprovided fields unchanged', () => {
      const entity = restoredEntity();

      entity.update({ lastName: 'Rodriguez' });

      expect(entity.lastName).toBe('Rodriguez');
      expect(entity.firstName).toBe('Juan Camilo');
      expect(entity.email).toBe('juan.garcia@correounivalle.edu.co');
      expect(entity.studentCode).toBe('202012345');
      expect(entity.programCode).toBe('2710');
    });

    it('EU4: does not touch id, passwordHash, status, or createdAt', () => {
      const entity = restoredEntity();

      entity.update({
        firstName: 'Maria',
        lastName: 'Rodriguez',
        email: 'maria@example.com',
        studentCode: '202099999',
        programCode: '2715',
      });

      expect(entity.id).toBe('elector-1');
      expect(entity.passwordHash).toBe('pbkdf2$210000$salt$hash');
      expect(entity.status).toBe('ACTIVE');
      expect(entity.createdAt).toEqual(new Date('2026-08-01T00:00:00.000Z'));
    });

    it('EU5: an empty input leaves the entity unchanged', () => {
      const entity = restoredEntity();

      entity.update({});

      expect(entity.firstName).toBe('Juan Camilo');
      expect(entity.lastName).toBe('Garcia Saenz');
      expect(entity.email).toBe('juan.garcia@correounivalle.edu.co');
      expect(entity.passwordHash).toBe('pbkdf2$210000$salt$hash');
      expect(entity.studentCode).toBe('202012345');
      expect(entity.programCode).toBe('2710');
      expect(entity.status).toBe('ACTIVE');
      expect(entity.id).toBe('elector-1');
    });
  });

  describe('deletedAt / isDeleted / delete', () => {
    const deletionDate = new Date('2026-09-01T10:00:00.000Z');

    function restored(overrides: Partial<Parameters<typeof ElectorEntity.restore>[0]> = {}) {
      return ElectorEntity.restore({
        id: 'elector-1',
        ...baseInput,
        identification: null,
        status: 'ACTIVE',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
        updatedAt: null,
        ...overrides,
      });
    }

    it('EDE-1: create() does not mark the elector as deleted', () => {
      const entity = ElectorEntity.create(baseInput);

      expect(entity.deletedAt).toBeNull();
      expect(entity.isDeleted()).toBe(false);
    });

    it('EDE-2: delete(fecha) marks the deletion with the received date', () => {
      const entity = restored();

      entity.delete(deletionDate);

      expect(entity.deletedAt).toEqual(deletionDate);
      expect(entity.isDeleted()).toBe(true);
    });

    it('EDE-3: delete() does not change status nor isActive()', () => {
      const active = restored();
      const inactive = restored({ status: ElectorEntity.INACTIVE_STATUS });

      active.delete(deletionDate);
      inactive.delete(deletionDate);

      expect(active.status).toBe('ACTIVE');
      expect(active.isActive()).toBe(true);
      expect(inactive.status).toBe('INACTIVE');
      expect(inactive.isActive()).toBe(false);
    });

    it('EDE-4: delete() does not alter any other field', () => {
      const createdAt = new Date('2026-08-01T00:00:00.000Z');
      const entity = restored({ createdAt });

      entity.delete(deletionDate);

      expect(entity.id).toBe('elector-1');
      expect(entity.firstName).toBe('Juan Camilo');
      expect(entity.lastName).toBe('Garcia Saenz');
      expect(entity.email).toBe('juan.garcia@correounivalle.edu.co');
      expect(entity.passwordHash).toBe('pbkdf2$210000$salt$hash');
      expect(entity.studentCode).toBe('202012345');
      expect(entity.programCode).toBe('2710');
      expect(entity.createdAt).toBe(createdAt);
    });

    it('EDE-5: restore({ deletedAt }) hydrates the deletion', () => {
      const entity = restored({ deletedAt: deletionDate });

      expect(entity.deletedAt).toEqual(deletionDate);
      expect(entity.isDeleted()).toBe(true);
    });

    it('EDE-5b: restore({ deletedAt: null }) hydrates a non-deleted elector', () => {
      const entity = restored({ deletedAt: null });

      expect(entity.deletedAt).toBeNull();
      expect(entity.isDeleted()).toBe(false);
    });

    it('EDE-6: deactivate() still throws ElectorAlreadyInactiveError', () => {
      const entity = restored({ status: ElectorEntity.INACTIVE_STATUS });

      expect(() => entity.deactivate()).toThrow(ElectorAlreadyInactiveError);
    });
  });

  describe('buildTemporaryPassword', () => {
    it('generates the password from the spec example 1', () => {
      expect(ElectorEntity.buildTemporaryPassword('Juan Camilo', 'Garcia Saenz', '202012345')).toBe(
        'JU202012345GA',
      );
    });

    it('generates the password from the spec example 2', () => {
      expect(
        ElectorEntity.buildTemporaryPassword('Maria Fernanda', 'Rodriguez Perez', '202012346'),
      ).toBe('MA202012346RO');
    });

    it('uses only the first given name, ignoring middle names', () => {
      expect(
        ElectorEntity.buildTemporaryPassword('Juan Camilo Andres', 'Garcia Saenz', '202012345'),
      ).toBe('JU202012345GA');
    });

    it('uses only the first surname, ignoring remaining surnames', () => {
      expect(ElectorEntity.buildTemporaryPassword('Juan', 'Garcia Saenz Lopez', '202012345')).toBe(
        'JU202012345GA',
      );
    });

    it('trims surrounding whitespace', () => {
      expect(ElectorEntity.buildTemporaryPassword('  Juan  ', ' Garcia ', ' 202012345 ')).toBe(
        'JU202012345GA',
      );
    });

    it('converts tokens to uppercase', () => {
      expect(ElectorEntity.buildTemporaryPassword('juan', 'garcia', '202012345')).toBe(
        'JU202012345GA',
      );
    });

    it('normalizes accented characters', () => {
      expect(ElectorEntity.buildTemporaryPassword('Ángel', 'Gómez', '202012347')).toBe(
        'AN202012347GO',
      );
    });

    it('uses available letters without padding for single-letter tokens', () => {
      expect(ElectorEntity.buildTemporaryPassword('A', 'B', '202012345')).toBe('A202012345B');
    });

    it('uses available letters for a single-letter surname', () => {
      expect(ElectorEntity.buildTemporaryPassword('Ana', 'B', '202012345')).toBe('AN202012345B');
    });

    it('collapses multiple inner spaces between tokens', () => {
      expect(
        ElectorEntity.buildTemporaryPassword('Juan   Camilo', 'Garcia   Saenz', '202012345'),
      ).toBe('JU202012345GA');
    });
  });
});
