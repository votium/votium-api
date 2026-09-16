import { PrismaService } from '../../src/shared/database/prisma.service';
import { CandidateEntity } from '../../src/modules/candidates/domain/entities/candidate.entity';
import { CandidateDuplicateError } from '../../src/modules/candidates/domain/errors/candidate-duplicate.error';
import type { CandidateSearchParams } from '../../src/modules/candidates/domain/repositories/candidate.repository.interface';
import { PrismaCandidateRepository } from '../../src/modules/candidates/infrastructure/repositories/prisma-candidate.repository';

describe('PrismaCandidateRepository integration', () => {
  let prisma: PrismaService;
  let repository: PrismaCandidateRepository;

  const suffix = Date.now();
  const usedStudentCodes: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaCandidateRepository(prisma);
  });

  afterEach(async () => {
    if (usedStudentCodes.length > 0) {
      await prisma.candidate.deleteMany({
        where: { student_code: { in: usedStudentCodes } },
      });
      usedStudentCodes.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function buildEntity(studentCode: string, identificationNumber: string): CandidateEntity {
    return CandidateEntity.create({
      firstName: 'Juan',
      lastName: 'Garcia',
      studentCode,
      programCode: '1234',
      identificationNumber,
    });
  }

  it('persists a candidate and returns a Prisma-generated id', async () => {
    const code = `INT-${suffix}`;
    usedStudentCodes.push(code);

    const saved = await repository.create(buildEntity(code, `ID-INT-${suffix}`));

    expect(saved.id).toBeTruthy();
    expect(saved.id).not.toBeNull();
  });

  it('returns a Prisma-generated createdAt', async () => {
    const code = `DATE-${suffix}`;
    usedStudentCodes.push(code);

    const saved = await repository.create(buildEntity(code, `ID-DATE-${suffix}`));

    expect(saved.createdAt).toBeInstanceOf(Date);
    expect(saved.createdAt!.getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(saved.createdAt!.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('stores all provided fields correctly', async () => {
    const code = `FIELDS-${suffix}`;
    usedStudentCodes.push(code);

    const saved = await repository.create(buildEntity(code, `ID-FIELDS-${suffix}`));

    expect(saved).toEqual(
      expect.objectContaining({
        firstName: 'Juan',
        lastName: 'Garcia',
        studentCode: code,
        programCode: '1234',
        identificationNumber: `ID-FIELDS-${suffix}`,
      }),
    );
  });

  it('stores the initial status ACTIVE (application-supplied, no DB default)', async () => {
    const code = `STATUS-${suffix}`;
    usedStudentCodes.push(code);

    const saved = await repository.create(buildEntity(code, `ID-STATUS-${suffix}`));

    expect(saved.status).toBe(CandidateEntity.DEFAULT_STATUS);
    expect(saved.status).toBe('ACTIVE');
  });

  it('rejects a duplicate student_code with CandidateDuplicateError', async () => {
    const code = `DUPCODE-${suffix}`;
    usedStudentCodes.push(code);

    await repository.create(buildEntity(code, `ID-DUP-1-${suffix}`));

    await expect(repository.create(buildEntity(code, `ID-DUP-2-${suffix}`))).rejects.toBeInstanceOf(
      CandidateDuplicateError,
    );
  });

  it('rejects a duplicate identification_number with CandidateDuplicateError', async () => {
    const idNumber = `IDDUP-${suffix}`;
    const code1 = `MAIL-1-${suffix}`;
    const code2 = `MAIL-2-${suffix}`;
    usedStudentCodes.push(code1, code2);

    await repository.create(buildEntity(code1, idNumber));

    await expect(repository.create(buildEntity(code2, idNumber))).rejects.toBeInstanceOf(
      CandidateDuplicateError,
    );
  });

  it('persists distinct candidates independently', async () => {
    const code1 = `IND-1-${suffix}`;
    const code2 = `IND-2-${suffix}`;
    usedStudentCodes.push(code1, code2);

    const first = await repository.create(buildEntity(code1, `ID-IND-1-${suffix}`));
    const second = await repository.create(buildEntity(code2, `ID-IND-2-${suffix}`));

    expect(first.id).not.toBe(second.id);
  });

  it('never updates an existing candidate when a unique constraint rejects the row', async () => {
    const code = `NOUPD-${suffix}`;
    usedStudentCodes.push(code);

    const original = await repository.create(buildEntity(code, `ID-NOUPD-${suffix}`));

    await expect(
      repository.create(buildEntity(code, `ID-NOUPD-2-${suffix}`)),
    ).rejects.toBeInstanceOf(CandidateDuplicateError);

    const rows = await prisma.candidate.findMany({ where: { student_code: code } });
    expect(rows).toHaveLength(1);
    expect(rows[0].identification_number).toBe(`ID-NOUPD-${suffix}`);
    expect(rows[0].first_name).toBe(original.firstName);
  });

  it('sends only the persisted fields: no id/created_at, and includes status', async () => {
    const code = `SPY-${suffix}`;
    usedStudentCodes.push(code);

    const createSpy = jest.spyOn(prisma.candidate, 'create');

    await repository.create(buildEntity(code, `ID-SPY-${suffix}`));

    const data = createSpy.mock.calls[0][0].data as Record<string, unknown>;
    expect(data).not.toHaveProperty('id');
    expect(data).not.toHaveProperty('created_at');
    expect(data).toMatchObject({
      first_name: 'Juan',
      last_name: 'Garcia',
      student_code: code,
      program_code: '1234',
      identification_number: `ID-SPY-${suffix}`,
      status: 'ACTIVE',
    });

    createSpy.mockRestore();
  });

  describe('findById', () => {
    it('returns the candidate with the given id', async () => {
      const code = `FIND-${suffix}`;
      usedStudentCodes.push(code);
      const saved = await repository.create(buildEntity(code, `ID-FIND-${suffix}`));

      const found = await repository.findById(saved.id!);

      expect(found).not.toBeNull();
      expect(found!.id).toBe(saved.id);
      expect(found!.studentCode).toBe(code);
    });

    it('returns null when the candidate does not exist', async () => {
      const found = await repository.findById(crypto.randomUUID());

      expect(found).toBeNull();
    });

    it('returns an inactive candidate (no status filter)', async () => {
      const code = `FIND-IN-${suffix}`;
      usedStudentCodes.push(code);
      const saved = await repository.create(buildEntity(code, `ID-FIND-IN-${suffix}`));
      await repository.updateStatus(saved.id!, CandidateEntity.INACTIVE_STATUS);

      const found = await repository.findById(saved.id!);

      expect(found).not.toBeNull();
      expect(found!.status).toBe(CandidateEntity.INACTIVE_STATUS);
    });
  });

  describe('updateStatus', () => {
    it('updates only the status field and returns the updated candidate', async () => {
      const code = `STAT-${suffix}`;
      usedStudentCodes.push(code);
      const saved = await repository.create(buildEntity(code, `ID-STAT-${suffix}`));

      const updated = await repository.updateStatus(saved.id!, CandidateEntity.INACTIVE_STATUS);

      expect(updated).not.toBeNull();
      expect(updated!.id).toBe(saved.id);
      expect(updated!.status).toBe(CandidateEntity.INACTIVE_STATUS);

      const row = await prisma.candidate.findUnique({ where: { id: saved.id! } });
      expect(row).not.toBeNull();
      expect(row!.status).toBe('INACTIVE');
      expect(row!.first_name).toBe('Juan');
      expect(row!.last_name).toBe('Garcia');
      expect(row!.student_code).toBe(code);
      expect(row!.program_code).toBe('1234');
      expect(row!.identification_number).toBe(`ID-STAT-${suffix}`);
      expect(row!.created_at).toBeInstanceOf(Date);
    });

    it('does not delete the row', async () => {
      const code = `STAT-NODEL-${suffix}`;
      usedStudentCodes.push(code);
      const saved = await repository.create(buildEntity(code, `ID-STAT-NODEL-${suffix}`));

      await repository.updateStatus(saved.id!, CandidateEntity.INACTIVE_STATUS);

      const rows = await prisma.candidate.findMany({ where: { student_code: code } });
      expect(rows).toHaveLength(1);
    });

    it('returns null when the candidate does not exist', async () => {
      const updated = await repository.updateStatus(
        crypto.randomUUID(),
        CandidateEntity.INACTIVE_STATUS,
      );

      expect(updated).toBeNull();
    });

    it('returns null when the row disappeared between read and update (P2025)', async () => {
      const code = `STAT-GONE-${suffix}`;
      usedStudentCodes.push(code);
      const saved = await repository.create(buildEntity(code, `ID-STAT-GONE-${suffix}`));

      await prisma.candidate.deleteMany({ where: { student_code: code } });

      const updated = await repository.updateStatus(saved.id!, CandidateEntity.INACTIVE_STATUS);

      expect(updated).toBeNull();
    });
  });

  describe('reactivate (status reversal)', () => {
    it('INT-R1: flips an INACTIVE candidate back to ACTIVE and preserves other columns', async () => {
      const code = `REACT-${suffix}`;
      usedStudentCodes.push(code);
      const saved = await repository.create(buildEntity(code, `ID-REACT-${suffix}`));
      await repository.updateStatus(saved.id!, CandidateEntity.INACTIVE_STATUS);

      const updated = await repository.updateStatus(saved.id!, CandidateEntity.DEFAULT_STATUS);

      expect(updated).not.toBeNull();
      expect(updated!.id).toBe(saved.id);
      expect(updated!.status).toBe(CandidateEntity.DEFAULT_STATUS);
      expect(updated!.status).toBe('ACTIVE');

      const row = await prisma.candidate.findUnique({ where: { id: saved.id! } });
      expect(row!.status).toBe('ACTIVE');
      expect(row!.first_name).toBe('Juan');
      expect(row!.student_code).toBe(code);
      expect(row!.identification_number).toBe(`ID-REACT-${suffix}`);
      expect(row!.created_at).toBeInstanceOf(Date);
    });

    it('INT-R2: a reactivated candidate becomes visible in search() results', async () => {
      const code = `REACTSRCH-${suffix}`;
      usedStudentCodes.push(code);
      const saved = await repository.create(buildEntity(code, `ID-REACTSRCH-${suffix}`));
      await repository.updateStatus(saved.id!, CandidateEntity.INACTIVE_STATUS);

      const hidden = await repository.search({ page: 1, limit: 100, studentCode: code });
      expect(hidden.candidates).toEqual([]);
      expect(hidden.total).toBe(0);

      await repository.updateStatus(saved.id!, CandidateEntity.DEFAULT_STATUS);

      const visible = await repository.search({ page: 1, limit: 100, studentCode: code });
      expect(visible.candidates).toHaveLength(1);
      expect(visible.candidates[0].id).toBe(saved.id);
      expect(visible.total).toBe(1);
    });
  });

  describe('update', () => {
    it('R-01: updates all editable fields and returns the updated entity', async () => {
      const code = `UPD-${suffix}`;
      usedStudentCodes.push(code);
      const saved = await repository.create(buildEntity(code, `ID-UPD-${suffix}`));

      const updated = await repository.update(saved.id!, {
        firstName: 'Maria',
        lastName: 'Lopez',
        programCode: '2710',
        identificationNumber: `ID-UPD-2-${suffix}`,
      });

      expect(updated).not.toBeNull();
      expect(updated!.firstName).toBe('Maria');
      expect(updated!.lastName).toBe('Lopez');
      expect(updated!.programCode).toBe('2710');
      expect(updated!.identificationNumber).toBe(`ID-UPD-2-${suffix}`);

      const row = await prisma.candidate.findUnique({ where: { id: saved.id! } });
      expect(row!.first_name).toBe('Maria');
      expect(row!.last_name).toBe('Lopez');
      expect(row!.program_code).toBe('2710');
      expect(row!.identification_number).toBe(`ID-UPD-2-${suffix}`);
    });

    it('R-02: partial update changes only the provided field', async () => {
      const code = `UPDP-${suffix}`;
      usedStudentCodes.push(code);
      const saved = await repository.create(buildEntity(code, `ID-UPDP-${suffix}`));

      const updated = await repository.update(saved.id!, { firstName: 'OnlyFirst' });

      expect(updated!.firstName).toBe('OnlyFirst');
      expect(updated!.lastName).toBe('Garcia');
      expect(updated!.programCode).toBe('1234');
      expect(updated!.identificationNumber).toBe(`ID-UPDP-${suffix}`);
    });

    it('R-03: returns null when the candidate does not exist', async () => {
      const updated = await repository.update(crypto.randomUUID(), { firstName: 'X' });

      expect(updated).toBeNull();
    });

    it('R-04: rejects a duplicate identificationNumber with CandidateDuplicateError', async () => {
      const codeA = `UPDDUP-A-${suffix}`;
      const codeB = `UPDDUP-B-${suffix}`;
      usedStudentCodes.push(codeA, codeB);
      const a = await repository.create(buildEntity(codeA, `ID-DUP-A-${suffix}`));
      await repository.create(buildEntity(codeB, `ID-DUP-B-${suffix}`));

      await expect(
        repository.update(a.id!, { identificationNumber: `ID-DUP-B-${suffix}` }),
      ).rejects.toBeInstanceOf(CandidateDuplicateError);

      const after = await prisma.candidate.findUnique({ where: { id: a.id! } });
      expect(after!.identification_number).toBe(`ID-DUP-A-${suffix}`);
    });

    it('R-05: sends only the provided fields to the Prisma client', async () => {
      const code = `UPDSPY-${suffix}`;
      usedStudentCodes.push(code);
      const saved = await repository.create(buildEntity(code, `ID-UPDSPY-${suffix}`));

      const updateSpy = jest.spyOn(prisma.candidate, 'update');

      await repository.update(saved.id!, { firstName: 'Spy' });

      const data = updateSpy.mock.calls[0][0].data as Record<string, unknown>;
      expect(data).toMatchObject({ first_name: 'Spy' });
      expect(data).not.toHaveProperty('id');
      expect(data).not.toHaveProperty('created_at');
      expect(data).not.toHaveProperty('student_code');
      expect(data).not.toHaveProperty('status');
      expect(data).not.toHaveProperty('last_name');
      expect(data).not.toHaveProperty('program_code');
      expect(data).not.toHaveProperty('identification_number');

      updateSpy.mockRestore();
    });

    it('R-06: updates a logically deleted (INACTIVE) candidate at the repository level', async () => {
      const code = `UPDIN-${suffix}`;
      usedStudentCodes.push(code);
      const saved = await repository.create(buildEntity(code, `ID-UPDIN-${suffix}`));
      await repository.updateStatus(saved.id!, CandidateEntity.INACTIVE_STATUS);

      const updated = await repository.update(saved.id!, { firstName: 'Changed' });

      expect(updated).not.toBeNull();
      expect(updated!.firstName).toBe('Changed');
      expect(updated!.status).toBe(CandidateEntity.INACTIVE_STATUS);
    });
  });

  describe('search', () => {
    const searchCodes: string[] = [];
    let candidateA: CandidateEntity;
    let candidateB: CandidateEntity;
    let candidateC: CandidateEntity;
    let candidateD: CandidateEntity;

    // Pagination seeds with explicit staggered created_at (deterministic order:
    // pgSeeds[2] newest, pgSeeds[0] oldest).
    const pgSeeds: Array<{ studentCode: string }> = [];
    // Inactive seed used by the includeInactive cases.
    let inactiveRow: { id: string; studentCode: string };
    // 2 ACTIVE + 1 INACTIVE rows sharing the same prefix (includeInactive + pagination).
    const comboSeeds: Array<{ studentCode: string }> = [];

    // search helper: page/limit are required by the contract, so they default to
    // generous values here to keep existing assertions scoped to the suite's own
    // rows (the pagination slices are exercised by the dedicated page/limit cases).
    const search = (
      params: Omit<CandidateSearchParams, 'page' | 'limit'> = {},
      page = 1,
      limit = 100,
    ) => repository.search({ ...params, page, limit });

    async function seedSearchCandidate(data: {
      firstName: string;
      lastName: string;
      programCode: string;
      studentCode: string;
      identificationNumber: string;
    }): Promise<CandidateEntity> {
      const saved = await repository.create(
        CandidateEntity.create({
          firstName: data.firstName,
          lastName: data.lastName,
          programCode: data.programCode,
          studentCode: data.studentCode,
          identificationNumber: data.identificationNumber,
        }),
      );
      searchCodes.push(saved.studentCode);
      return saved;
    }

    beforeAll(async () => {
      // Assertions below are scoped to this suite's own seeded rows via
      // searchCodes, so they stay deterministic even when other integration
      // suites seed candidates concurrently. Do NOT wipe the global candidates
      // table here: the tests run in parallel over a shared database and such a
      // wipe can delete rows another suite depends on.
      candidateA = await seedSearchCandidate({
        firstName: 'Juan',
        lastName: 'Garcia',
        programCode: '1234',
        studentCode: `SRCH-A-${suffix}`,
        identificationNumber: `ID-A-${suffix}`,
      });
      candidateB = await seedSearchCandidate({
        firstName: 'Maria',
        lastName: 'Rodriguez',
        programCode: '2710',
        studentCode: `SRCH-B-${suffix}`,
        identificationNumber: `ID-B-${suffix}`,
      });
      candidateC = await seedSearchCandidate({
        firstName: 'Juan',
        lastName: 'Perez',
        programCode: '1234',
        studentCode: `SRCH-C-${suffix}`,
        identificationNumber: `ID-C-${suffix}`,
      });
      candidateD = await seedSearchCandidate({
        firstName: 'Ana',
        lastName: 'Lopez',
        programCode: '9999',
        studentCode: `SRCH-D-${suffix}`,
        identificationNumber: `ID-D-${suffix}`,
      });

      // Pagination seeds (ACTIVE) with explicit staggered created_at.
      const now = Date.now();
      const pgRows = [
        { tag: 'A', createdAt: new Date(now - 3 * 60_000) },
        { tag: 'B', createdAt: new Date(now - 2 * 60_000) },
        { tag: 'C', createdAt: new Date(now - 1 * 60_000) },
      ];
      for (const { tag, createdAt } of pgRows) {
        const row = await prisma.candidate.create({
          data: {
            first_name: `PG-${suffix}-${tag}`,
            last_name: `Row${tag}`,
            student_code: `PG-${suffix}-${tag}`,
            program_code: '7777',
            identification_number: `IDPG-${suffix}-${tag}`,
            status: 'ACTIVE',
            created_at: createdAt,
          },
        });
        searchCodes.push(row.student_code);
        pgSeeds.push({ studentCode: row.student_code });
      }

      // Inactive seed (lastName 'Row') used by the includeInactive cases.
      const inactive = await prisma.candidate.create({
        data: {
          first_name: `INAC-${suffix}`,
          last_name: 'Row',
          student_code: `SRCH-IN-${suffix}`,
          program_code: '1234',
          identification_number: `ID-IN-${suffix}`,
          status: 'INACTIVE',
        },
      });
      searchCodes.push(inactive.student_code);
      inactiveRow = { id: inactive.id, studentCode: inactive.student_code };

      // 2 ACTIVE + 1 INACTIVE rows sharing the same prefix (I10).
      for (const tag of ['1', '2', '3']) {
        const row = await prisma.candidate.create({
          data: {
            first_name: `C10-${suffix}-${tag}`,
            last_name: `Combo${tag}`,
            student_code: `C10-${suffix}-${tag}`,
            program_code: '8888',
            identification_number: `IDC10-${suffix}-${tag}`,
            status: tag === '3' ? 'INACTIVE' : 'ACTIVE',
          },
        });
        searchCodes.push(row.student_code);
        comboSeeds.push({ studentCode: row.student_code });
      }
    });

    afterAll(async () => {
      if (searchCodes.length > 0) {
        await prisma.candidate.deleteMany({ where: { student_code: { in: searchCodes } } });
      }
    });

    it('I1: returns all owned candidates with the correct total when no filters are provided', async () => {
      const result = await search({});

      const own = result.candidates.filter((row) => searchCodes.includes(row.studentCode));
      expect(own.map((row) => row.studentCode)).toEqual(
        expect.arrayContaining([
          candidateA.studentCode,
          candidateB.studentCode,
          candidateC.studentCode,
          candidateD.studentCode,
        ]),
      );
      expect(result.total).toBeGreaterThanOrEqual(searchCodes.length);

      const times = own.map((row) => row.createdAt!.getTime());
      for (let i = 1; i < times.length; i++) {
        expect(times[i]).toBeLessThanOrEqual(times[i - 1]);
      }
    });

    it('filters firstName with a case-insensitive partial match', async () => {
      const byLower = await search({ firstName: 'jua' });
      expect(
        byLower.candidates
          .filter((row) => searchCodes.includes(row.studentCode))
          .map((row) => row.studentCode)
          .sort(),
      ).toEqual([candidateA.studentCode, candidateC.studentCode].sort());

      const byUpper = await search({ firstName: 'JUAN' });
      expect(
        byUpper.candidates
          .filter((row) => searchCodes.includes(row.studentCode))
          .map((row) => row.studentCode)
          .sort(),
      ).toEqual([candidateA.studentCode, candidateC.studentCode].sort());
    });

    it('filters lastName with a case-insensitive partial match', async () => {
      const rows = await search({ lastName: 'rodri' });
      expect(
        rows.candidates
          .filter((row) => searchCodes.includes(row.studentCode))
          .map((row) => row.studentCode),
      ).toEqual([candidateB.studentCode]);
    });

    it('filters studyPlanCode with an exact match', async () => {
      const exact = await search({ studyPlanCode: '1234' });
      expect(
        exact.candidates
          .filter((row) => searchCodes.includes(row.studentCode))
          .map((row) => row.studentCode)
          .sort(),
      ).toEqual([candidateA.studentCode, candidateC.studentCode].sort());

      const partial = await search({ studyPlanCode: '123' });
      expect(partial.candidates).toEqual([]);
      expect(partial.total).toBe(0);
    });

    it('filters studentCode with an exact match', async () => {
      const rows = await search({ studentCode: candidateB.studentCode });
      expect(rows.candidates.map((row) => row.studentCode)).toEqual([candidateB.studentCode]);
    });

    it('filters identificationNumber with an exact match', async () => {
      const rows = await search({ identificationNumber: candidateD.identificationNumber });
      expect(rows.candidates.map((row) => row.studentCode)).toEqual([candidateD.studentCode]);
    });

    it('combines multiple filters with AND semantics', async () => {
      const byNameAndPlan = await search({ firstName: 'Juan', studyPlanCode: '1234' });
      expect(
        byNameAndPlan.candidates
          .filter((row) => searchCodes.includes(row.studentCode))
          .map((row) => row.studentCode)
          .sort(),
      ).toEqual([candidateA.studentCode, candidateC.studentCode].sort());

      const allThree = await search({
        firstName: 'Juan',
        studyPlanCode: '1234',
        studentCode: candidateA.studentCode,
      });
      expect(allThree.candidates.map((row) => row.studentCode)).toEqual([candidateA.studentCode]);
    });

    it('ignores empty and whitespace-only filter values', async () => {
      const result = await search({ firstName: '   ', studentCode: '' });

      const own = result.candidates
        .filter((row) => searchCodes.includes(row.studentCode))
        .map((row) => row.studentCode)
        .sort();

      // Every owned row except the INACTIVE one (excluded by default).
      const expected = [
        candidateA.studentCode,
        candidateB.studentCode,
        candidateC.studentCode,
        candidateD.studentCode,
        ...pgSeeds.map((s) => s.studentCode),
        ...comboSeeds.slice(0, 2).map((s) => s.studentCode),
      ].sort();
      expect(own).toEqual(expected);
    });

    it('trims filter values before matching', async () => {
      const rows = await search({ studyPlanCode: ' 1234 ', firstName: ' Juan ' });
      expect(
        rows.candidates
          .filter((row) => searchCodes.includes(row.studentCode))
          .map((row) => row.studentCode)
          .sort(),
      ).toEqual([candidateA.studentCode, candidateC.studentCode].sort());
    });

    it('I19: returns an empty page when no candidate matches', async () => {
      const rows = await search({ identificationNumber: 'NOPE' });
      expect(rows.candidates).toEqual([]);
      expect(rows.total).toBe(0);
    });

    it('I18: does not create, update, or delete rows', async () => {
      const before = await prisma.candidate.count({
        where: { student_code: { in: usedStudentCodes } },
      });

      await search({});
      await search({ firstName: 'x' });

      const after = await prisma.candidate.count({
        where: { student_code: { in: usedStudentCodes } },
      });
      expect(after).toBe(before);
    });

    it('I6: excludes logically deleted (INACTIVE) candidates by default', async () => {
      const byCode = await search({ studentCode: inactiveRow.studentCode });
      expect(byCode.candidates).toEqual([]);
      expect(byCode.total).toBe(0);

      const all = await search({});
      expect(all.candidates.map((row) => row.studentCode)).not.toContain(inactiveRow.studentCode);
    });

    it('I2: pages through results with a stable slice and consistent total', async () => {
      const page1 = await search({ name: `PG-${suffix}` }, 1, 1);
      expect(page1.candidates.map((row) => row.studentCode)).toEqual([pgSeeds[2].studentCode]);
      expect(page1.total).toBe(3);

      const page2 = await search({ name: `PG-${suffix}` }, 2, 1);
      expect(page2.candidates.map((row) => row.studentCode)).toEqual([pgSeeds[1].studentCode]);
      expect(page2.total).toBe(3);

      const page3 = await search({ name: `PG-${suffix}` }, 3, 1);
      expect(page3.candidates.map((row) => row.studentCode)).toEqual([pgSeeds[0].studentCode]);
      expect(page3.total).toBe(3);
    });

    it('I3: total reflects the whole filtered set, not the paginated slice', async () => {
      const page1 = await search({ name: `PG-${suffix}` }, 1, 1);
      expect(page1.candidates).toHaveLength(1);
      expect(page1.total).toBe(3);

      const withoutFilter = await search({});
      expect(withoutFilter.total).toBeGreaterThanOrEqual(searchCodes.length);
    });

    it('I4: an out-of-range page returns an empty slice but keeps the real total', async () => {
      const result = await search({ name: `PG-${suffix}` }, 999, 1);
      expect(result.candidates).toEqual([]);
      expect(result.total).toBe(3);
    });

    it('I5: a limit larger than the total returns everything in one page', async () => {
      const result = await search({ name: `PG-${suffix}` }, 1, 100);
      expect(result.candidates).toHaveLength(3);
      expect(result.candidates.length).toBe(result.total);
    });

    it('I7: includeInactive=false behaves like the default', async () => {
      const result = await search({ studentCode: inactiveRow.studentCode, includeInactive: false });
      expect(result.candidates).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('I8: includeInactive=true includes INACTIVE candidates and counts them in total', async () => {
      const result = await search({ studentCode: inactiveRow.studentCode, includeInactive: true });
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].status).toBe(CandidateEntity.INACTIVE_STATUS);
      expect(result.total).toBe(1);
    });

    it('I9: inactive candidates still respect the other AND filters', async () => {
      const byName = await search({ name: `INAC-${suffix}`, includeInactive: true });
      expect(byName.candidates.map((row) => row.studentCode)).toEqual([inactiveRow.studentCode]);
      expect(byName.total).toBe(1);
    });

    it('I10: includeInactive combined with pagination keeps total consistent', async () => {
      const page1 = await search({ name: `C10-${suffix}`, includeInactive: true }, 1, 2);
      expect(page1.candidates).toHaveLength(2);
      expect(page1.total).toBe(3);

      const page2 = await search({ name: `C10-${suffix}`, includeInactive: true }, 2, 2);
      expect(page2.candidates).toHaveLength(1);
      expect(page2.total).toBe(3);

      const page3 = await search({ name: `C10-${suffix}`, includeInactive: true }, 3, 2);
      expect(page3.candidates).toHaveLength(0);
      expect(page3.total).toBe(3);
    });

    it('I11: the name filter matches a partial first name', async () => {
      const rows = await search({ name: 'jua' });
      expect(
        rows.candidates
          .filter((row) => searchCodes.includes(row.studentCode))
          .map((row) => row.studentCode)
          .sort(),
      ).toEqual([candidateA.studentCode, candidateC.studentCode].sort());
    });

    it('I12: the name filter matches a partial last name', async () => {
      const rows = await search({ name: 'rodri' });
      expect(
        rows.candidates
          .filter((row) => searchCodes.includes(row.studentCode))
          .map((row) => row.studentCode),
      ).toEqual([candidateB.studentCode]);
    });

    it('I13: the name filter is case-insensitive and partial', async () => {
      const byUpper = await search({ name: 'JUAN' });
      expect(
        byUpper.candidates
          .filter((row) => searchCodes.includes(row.studentCode))
          .map((row) => row.studentCode)
          .sort(),
      ).toEqual([candidateA.studentCode, candidateC.studentCode].sort());

      const byPartial = await search({ name: 'per' });
      expect(
        byPartial.candidates
          .filter((row) => searchCodes.includes(row.studentCode))
          .map((row) => row.studentCode),
      ).toEqual([candidateC.studentCode]);
    });

    it('I14: the name filter combines with other filters via AND and pagination', async () => {
      const page1 = await search({ name: `PG-${suffix}`, studyPlanCode: '7777' }, 1, 1);
      expect(page1.candidates).toHaveLength(1);
      expect(page1.candidates[0].studentCode).toBe(pgSeeds[2].studentCode);
      expect(page1.total).toBe(3);
    });

    it('I20: total is consistent with the same where used for the page', async () => {
      const byName = await search({ name: `PG-${suffix}` }, 1, 1);
      const count = await prisma.candidate.count({
        where: { first_name: { contains: `PG-${suffix}`, mode: 'insensitive' } },
      });
      expect(byName.total).toBe(count);

      const byNameInactive = await search({ name: `INAC-${suffix}`, includeInactive: true });
      const countInactive = await prisma.candidate.count({
        where: { first_name: { contains: `INAC-${suffix}`, mode: 'insensitive' } },
      });
      expect(byNameInactive.total).toBe(countInactive);
      expect(byNameInactive.total).toBe(1);
    });
  });
});
