import { ElectorAlreadyInactiveError } from '../errors/elector-already-inactive.error';
import { ElectorEntity } from './elector.entity';

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
      const entity = ElectorEntity.restore({
        id: 'elector-1',
        ...baseInput,
        status: 'ACTIVE',
        createdAt,
      });

      expect(entity.id).toBe('elector-1');
      expect(entity.createdAt).toBe(createdAt);
      expect(entity.firstName).toBe('Juan Camilo');
      expect(entity.lastName).toBe('Garcia Saenz');
      expect(entity.email).toBe('juan.garcia@correounivalle.edu.co');
      expect(entity.passwordHash).toBe('pbkdf2$210000$salt$hash');
      expect(entity.studentCode).toBe('202012345');
      expect(entity.programCode).toBe('2710');
      expect(entity.status).toBe('ACTIVE');
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
        status: 'ACTIVE',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
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
        status: 'INACTIVE',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
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
        status: 'ACTIVE',
        createdAt,
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
        status: 'INACTIVE',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
      });

      expect(() => entity.deactivate()).toThrow(ElectorAlreadyInactiveError);
      expect(entity.status).toBe('INACTIVE');
    });

    it('D3: exposes the shared INACTIVE status constant after restore', () => {
      const entity = ElectorEntity.restore({
        id: 'elector-1',
        ...baseInput,
        status: 'INACTIVE',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
      });

      expect(entity.status).toBe(ElectorEntity.INACTIVE_STATUS);
    });
  });

  describe('update', () => {
    function restoredEntity() {
      return ElectorEntity.restore({
        id: 'elector-1',
        ...baseInput,
        status: 'ACTIVE',
        createdAt: new Date('2026-08-01T00:00:00.000Z'),
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
