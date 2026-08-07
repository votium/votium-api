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
