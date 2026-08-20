import { PrismaService } from '../../src/shared/database/prisma.service';
import { CandidateEntity } from '../../src/modules/candidates/domain/entities/candidate.entity';
import { CandidateDuplicateError } from '../../src/modules/candidates/domain/errors/candidate-duplicate.error';
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

  describe('search', () => {
    const searchCodes: string[] = [];
    let candidateA: CandidateEntity;
    let candidateB: CandidateEntity;
    let candidateC: CandidateEntity;
    let candidateD: CandidateEntity;

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
      // Start from a clean slate: this is the only integration spec that writes candidates,
      // so removing all rows makes the search assertions deterministic even if a previous run
      // left stray rows behind.
      await prisma.candidate.deleteMany({});

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
    });

    afterAll(async () => {
      if (searchCodes.length > 0) {
        await prisma.candidate.deleteMany({ where: { student_code: { in: searchCodes } } });
      }
    });

    it('returns all candidates ordered by created_at desc when no filters are provided', async () => {
      const rows = await repository.search({});

      const codes = rows.map((row) => row.studentCode);
      expect(codes).toHaveLength(4);
      expect(codes).toEqual(
        expect.arrayContaining([
          candidateA.studentCode,
          candidateB.studentCode,
          candidateC.studentCode,
          candidateD.studentCode,
        ]),
      );

      const times = rows.map((row) => row.createdAt!.getTime());
      for (let i = 1; i < times.length; i++) {
        expect(times[i]).toBeLessThanOrEqual(times[i - 1]);
      }
    });

    it('filters firstName with a case-insensitive partial match', async () => {
      const byLower = await repository.search({ firstName: 'jua' });
      expect(byLower.map((row) => row.studentCode).sort()).toEqual(
        [candidateA.studentCode, candidateC.studentCode].sort(),
      );

      const byUpper = await repository.search({ firstName: 'JUAN' });
      expect(byUpper.map((row) => row.studentCode).sort()).toEqual(
        [candidateA.studentCode, candidateC.studentCode].sort(),
      );
    });

    it('filters lastName with a case-insensitive partial match', async () => {
      const rows = await repository.search({ lastName: 'rodri' });
      expect(rows.map((row) => row.studentCode)).toEqual([candidateB.studentCode]);
    });

    it('filters studyPlanCode with an exact match', async () => {
      const exact = await repository.search({ studyPlanCode: '1234' });
      expect(exact.map((row) => row.studentCode).sort()).toEqual(
        [candidateA.studentCode, candidateC.studentCode].sort(),
      );

      const partial = await repository.search({ studyPlanCode: '123' });
      expect(partial).toEqual([]);
    });

    it('filters studentCode with an exact match', async () => {
      const rows = await repository.search({ studentCode: candidateB.studentCode });
      expect(rows.map((row) => row.studentCode)).toEqual([candidateB.studentCode]);
    });

    it('filters identificationNumber with an exact match', async () => {
      const rows = await repository.search({
        identificationNumber: candidateD.identificationNumber,
      });
      expect(rows.map((row) => row.studentCode)).toEqual([candidateD.studentCode]);
    });

    it('combines multiple filters with AND semantics', async () => {
      const byNameAndPlan = await repository.search({ firstName: 'Juan', studyPlanCode: '1234' });
      expect(byNameAndPlan.map((row) => row.studentCode).sort()).toEqual(
        [candidateA.studentCode, candidateC.studentCode].sort(),
      );

      const allThree = await repository.search({
        firstName: 'Juan',
        studyPlanCode: '1234',
        studentCode: candidateA.studentCode,
      });
      expect(allThree.map((row) => row.studentCode)).toEqual([candidateA.studentCode]);
    });

    it('ignores empty and whitespace-only filter values', async () => {
      const rows = await repository.search({ firstName: '   ', studentCode: '' });
      expect(rows).toHaveLength(4);
    });

    it('trims filter values before matching', async () => {
      const rows = await repository.search({ studyPlanCode: ' 1234 ', firstName: ' Juan ' });
      expect(rows.map((row) => row.studentCode).sort()).toEqual(
        [candidateA.studentCode, candidateC.studentCode].sort(),
      );
    });

    it('returns an empty array when no candidate matches', async () => {
      const rows = await repository.search({ identificationNumber: 'NOPE' });
      expect(rows).toEqual([]);
    });

    it('does not create, update, or delete rows', async () => {
      const before = await prisma.candidate.count();

      await repository.search({});
      await repository.search({ firstName: 'x' });

      const after = await prisma.candidate.count();
      expect(after).toBe(before);
    });

    it('returns rows regardless of status (no status filter)', async () => {
      const inactive = await prisma.candidate.create({
        data: {
          first_name: 'Inactive',
          last_name: 'Row',
          student_code: `SRCH-IN-${suffix}`,
          program_code: '1234',
          identification_number: `ID-IN-${suffix}`,
          status: 'INACTIVE',
        },
      });
      searchCodes.push(inactive.student_code);

      const rows = await repository.search({ lastName: 'Row' });
      expect(rows).toHaveLength(1);
      expect(rows[0].studentCode).toBe(inactive.student_code);
    });
  });
});
