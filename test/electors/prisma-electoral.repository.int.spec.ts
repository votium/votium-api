import { PrismaService } from '../../src/shared/database/prisma.service';
import { ElectorEntity } from '../../src/modules/electors/domain/entities/elector.entity';
import { ElectorDuplicateError } from '../../src/modules/electors/domain/errors/elector-duplicate.error';
import { PrismaElectorRepository } from '../../src/modules/electors/infrastructure/repositories/prisma-elector.repository';

describe('PrismaElectorRepository integration', () => {
  let prisma: PrismaService;
  let repository: PrismaElectorRepository;

  const suffix = Date.now();
  const usedStudentCodes: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaElectorRepository(prisma);
  });

  afterEach(async () => {
    if (usedStudentCodes.length > 0) {
      await prisma.elector.deleteMany({ where: { student_code: { in: usedStudentCodes } } });
      usedStudentCodes.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function buildEntity(studentCode: string, email: string): ElectorEntity {
    return ElectorEntity.create({
      firstName: 'Juan',
      lastName: 'Garcia',
      email,
      passwordHash: 'pbkdf2$210000$salt$hash',
      studentCode,
      programCode: '2710',
    });
  }

  it('persists an elector and returns Prisma-generated id and createdAt', async () => {
    const code = `INT-${suffix}`;
    const email = `elector-${suffix}@example.com`;
    usedStudentCodes.push(code);

    const saved = await repository.create(buildEntity(code, email));

    expect(saved.id).toBeTruthy();
    expect(saved.createdAt).toBeInstanceOf(Date);
    expect(saved).toEqual(
      expect.objectContaining({
        firstName: 'Juan',
        lastName: 'Garcia',
        email,
        passwordHash: 'pbkdf2$210000$salt$hash',
        studentCode: code,
        programCode: '2710',
        status: 'ACTIVE',
      }),
    );
  });

  it('rejects a duplicate student_code with ElectorDuplicateError', async () => {
    const code = `DUP-${suffix}`;
    usedStudentCodes.push(code);

    await repository.create(buildEntity(code, `dup-email-${suffix}@example.com`));

    await expect(
      repository.create(buildEntity(code, `dup-email-2-${suffix}@example.com`)),
    ).rejects.toBeInstanceOf(ElectorDuplicateError);
  });

  it('rejects a duplicate email with ElectorDuplicateError', async () => {
    const email = `dup-mail-${suffix}@example.com`;
    const code1 = `MAIL-1-${suffix}`;
    const code2 = `MAIL-2-${suffix}`;
    usedStudentCodes.push(code1, code2);

    await repository.create(buildEntity(code1, email));

    await expect(repository.create(buildEntity(code2, email))).rejects.toBeInstanceOf(
      ElectorDuplicateError,
    );
  });

  it('persists distinct electors independently', async () => {
    const code1 = `IND-1-${suffix}`;
    const code2 = `IND-2-${suffix}`;
    usedStudentCodes.push(code1, code2);

    const first = await repository.create(buildEntity(code1, `ind-1-${suffix}@example.com`));
    const second = await repository.create(buildEntity(code2, `ind-2-${suffix}@example.com`));

    expect(first.id).not.toBe(second.id);
  });

  describe('findAll', () => {
    const fixtures = [
      { key: 'juan2710', firstName: 'Juan Camilo', lastName: 'Garcia Saenz', programCode: '2710' },
      { key: 'juan2_2710', firstName: 'JUAN Carlos', lastName: 'Perez Rojas', programCode: '2710' },
      { key: 'maria2711', firstName: 'Maria Fernanda', lastName: 'GARCIA', programCode: '2711' },
      { key: 'ana2711', firstName: 'Ana Sofia', lastName: 'Lopez', programCode: '2711' },
    ] as const;

    const codes = {
      juan2710: `FND-1-${suffix}`,
      juan2_2710: `FND-2-${suffix}`,
      maria2711: `FND-3-${suffix}`,
      ana2711: `FND-4-${suffix}`,
    };

    beforeEach(async () => {
      await prisma.elector.deleteMany({});
      for (const fixture of fixtures) {
        const code = codes[fixture.key];
        await repository.create(
          ElectorEntity.create({
            firstName: fixture.firstName,
            lastName: fixture.lastName,
            email: `${code.toLowerCase()}@correounivalle.edu.co`,
            passwordHash: 'pbkdf2$int-hash',
            studentCode: code,
            programCode: fixture.programCode,
          }),
        );
        usedStudentCodes.push(code);
      }
    });

    const search = (params: {
      page?: number;
      limit?: number;
      programCode?: string;
      studentCode?: string;
      name?: string;
    }) => repository.findAll({ page: params.page ?? 1, limit: params.limit ?? 10, ...params });

    const codesOf = (result: { electors: ElectorEntity[] }): string[] =>
      result.electors.map((elector) => elector.studentCode);

    it('returns only electors with the given program code (AC-02)', async () => {
      const result = await search({ programCode: '2710' });

      expect(codesOf(result).sort()).toEqual([codes.juan2710, codes.juan2_2710].sort());
      expect(result.total).toBe(2);
    });

    it('matches program code exactly, rejecting partial or extended codes (AC-03)', async () => {
      for (const programCode of ['271', '27101', '12710']) {
        const result = await search({ programCode });
        expect(result).toEqual({ electors: [], total: 0 });
      }
    });

    it('returns the elector matching an exact student code (AC-04)', async () => {
      const result = await search({ studentCode: codes.juan2710 });

      expect(result.total).toBe(1);
      expect(result.electors[0].id).toBeTruthy();
      expect(result.electors[0]).toEqual(
        expect.objectContaining({
          firstName: 'Juan Camilo',
          lastName: 'Garcia Saenz',
          studentCode: codes.juan2710,
          programCode: '2710',
          status: 'ACTIVE',
        }),
      );
    });

    it('matches student code exactly, rejecting prefixes and suffixes (AC-05)', async () => {
      const prefixResult = await search({ studentCode: `FND-1` });
      expect(prefixResult).toEqual({ electors: [], total: 0 });

      const suffixResult = await search({ studentCode: `${codes.juan2710}-extra` });
      expect(suffixResult).toEqual({ electors: [], total: 0 });
    });

    it('matches electors by first name (AC-06)', async () => {
      const result = await search({ name: 'juan' });

      expect(codesOf(result).sort()).toEqual([codes.juan2710, codes.juan2_2710].sort());
      expect(result.total).toBe(2);
    });

    it('matches electors by last name (AC-07)', async () => {
      const result = await search({ name: 'garcia' });

      expect(codesOf(result).sort()).toEqual([codes.juan2710, codes.maria2711].sort());
      expect(result.total).toBe(2);
    });

    it('matches partial names within multi-word names (AC-08)', async () => {
      const result = await search({ name: 'juan' });

      expect(codesOf(result)).toContain(codes.juan2710); // first_name = 'Juan Camilo'
    });

    it('matches names case-insensitively (AC-09)', async () => {
      const variants = ['juan', 'Juan', 'JUAN', 'jUaN'];
      const resultSets = [];

      for (const name of variants) {
        const result = await search({ name });
        resultSets.push(codesOf(result).sort());
      }

      for (const set of resultSets) {
        expect(set).toEqual(resultSets[0]);
      }
      expect(resultSets[0]).toHaveLength(2);
    });

    it('combines program and name filters with AND logic (AC-10)', async () => {
      const result = await search({ programCode: '2710', name: 'juan' });

      expect(codesOf(result).sort()).toEqual([codes.juan2710, codes.juan2_2710].sort());
      expect(result.total).toBe(2);
    });

    it('combines program and student code filters with AND logic (AC-11)', async () => {
      const result = await search({ programCode: '2710', studentCode: codes.juan2_2710 });

      expect(codesOf(result)).toEqual([codes.juan2_2710]);
      expect(result.total).toBe(1);
    });

    it('excludes an elector matching only one of the supplied filters (AC-12)', async () => {
      const result = await search({ programCode: '2710', name: 'lopez' });

      expect(result).toEqual({ electors: [], total: 0 });
    });

    it('returns an empty collection for a valid search with no matches (AC-14)', async () => {
      const result = await search({ programCode: '9999' });

      expect(result).toEqual({ electors: [], total: 0 });
    });

    it('does not apply filters that were not supplied (BR-10)', async () => {
      const result = await search({});

      expect(result.total).toBe(fixtures.length);
      expect(codesOf(result)).toHaveLength(fixtures.length);
    });

    it('ignores whitespace-only name filters (repository-level trim)', async () => {
      const result = await search({ name: '   ' });

      expect(result.total).toBe(fixtures.length);
    });

    it('paginates results respecting page and limit while counting all matches (AC-13)', async () => {
      const page1 = await search({ page: 1, limit: 2 });
      const page2 = await search({ page: 2, limit: 2 });

      expect(page1.electors).toHaveLength(2);
      expect(page2.electors).toHaveLength(2);
      expect(page1.total).toBe(fixtures.length);
      expect(page2.total).toBe(fixtures.length);

      const page1Codes = codesOf(page1);
      const page2Codes = codesOf(page2);
      expect(page1Codes).not.toEqual(expect.arrayContaining(page2Codes));
    });

    it('does not load the electoralRolls relation (AC-17)', async () => {
      const saved = await repository.create(
        ElectorEntity.create({
          firstName: 'Rel',
          lastName: 'Check',
          email: `rel-check-${suffix}@correounivalle.edu.co`,
          passwordHash: 'pbkdf2$int-hash',
          studentCode: `REL-${suffix}`,
          programCode: '2712',
        }),
      );
      usedStudentCodes.push(`REL-${suffix}`);

      const election = await prisma.election.create({
        data: {
          name: `I16 Election ${suffix}`,
          description: 'Integration test election',
          start_date: new Date('2026-09-01T00:00:00.000Z'),
          start_time: new Date('2026-09-01T08:00:00.000Z'),
          end_date: new Date('2026-09-30T00:00:00.000Z'),
          end_time: new Date('2026-09-30T18:00:00.000Z'),
        },
      });

      try {
        await prisma.electoralRoll.create({
          data: { election_id: election.id, elector_id: saved.id },
        });

        const result = await search({ studentCode: `REL-${suffix}` });

        const elector = result.electors[0];
        expect(elector).toBeDefined();
        expect((elector as unknown as Record<string, unknown>).electoralRolls).toBeUndefined();
      } finally {
        await prisma.electoralRoll.deleteMany({ where: { elector_id: saved.id } });
        await prisma.election.delete({ where: { id: election.id } });
      }
    });

    it('does not modify elector records when searching (AC-18)', async () => {
      const before = await prisma.elector.findMany({
        where: { student_code: { in: Object.values(codes) } },
        orderBy: { student_code: 'asc' },
      });

      await search({ programCode: '2710', name: 'juan' });

      const after = await prisma.elector.findMany({
        where: { student_code: { in: Object.values(codes) } },
        orderBy: { student_code: 'asc' },
      });

      expect(after).toEqual(before);
    });

    it('builds the where clause only from supplied filters (BR-10)', async () => {
      const findManySpy = jest.spyOn(prisma.elector, 'findMany');
      try {
        await search({ programCode: '2710' });
        const programWhere = findManySpy.mock.calls.at(-1)?.[0]?.where as Record<string, unknown>;
        expect(programWhere).toEqual({ program_code: '2710' });
      } finally {
        findManySpy.mockRestore();
      }

      const nameSpy = jest.spyOn(prisma.elector, 'findMany');
      try {
        await search({ name: 'juan' });
        const nameWhere = nameSpy.mock.calls.at(-1)?.[0]?.where as Record<string, unknown>;
        expect(nameWhere).toHaveProperty('OR');
        expect(nameWhere).not.toHaveProperty('program_code');
        expect(nameWhere).not.toHaveProperty('student_code');
      } finally {
        nameSpy.mockRestore();
      }
    });
  });
});
