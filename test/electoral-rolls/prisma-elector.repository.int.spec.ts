import { PrismaService } from '../../src/shared/database/prisma.service';
import { ElectorEntity } from '../../src/modules/electors/domain/entities/elector.entity';
import { PrismaElectorRepository } from '../../src/modules/electors/infrastructure/repositories/prisma-elector.repository';

describe('PrismaElectorRepository integration - findByStudentCodeAndProgramCode', () => {
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

  async function seedElector(studentCode: string, programCode: string): Promise<void> {
    await prisma.elector.create({
      data: {
        first_name: 'Test',
        last_name: 'Elector',
        email: `${studentCode.toLowerCase()}-${suffix}@example.com`,
        password_hash: 'pbkdf2$placeholder',
        student_code: studentCode,
        program_code: programCode,
        status: 'ACTIVE',
      },
    });
    usedStudentCodes.push(studentCode);
  }

  it('IP1: returns electors matching each exact (studentCode, programCode) pair', async () => {
    await seedElector(`A-${suffix}`, '2710');
    await seedElector(`B-${suffix}`, '2711');

    const found = await repository.findByStudentCodeAndProgramCode([
      { studentCode: `A-${suffix}`, programCode: '2710' },
      { studentCode: `B-${suffix}`, programCode: '2711' },
    ]);

    expect(found.map((e) => e.studentCode).sort()).toEqual([`A-${suffix}`, `B-${suffix}`]);
  });

  it('IP2: returns only the matching electors when some pairs do not match', async () => {
    await seedElector(`A-${suffix}`, '2710');

    const found = await repository.findByStudentCodeAndProgramCode([
      { studentCode: `A-${suffix}`, programCode: '2710' },
      { studentCode: `GHOST-${suffix}`, programCode: '9999' },
    ]);

    expect(found).toHaveLength(1);
    expect(found[0].studentCode).toBe(`A-${suffix}`);
  });

  it('IP3: returns an empty array when no pairs match', async () => {
    const found = await repository.findByStudentCodeAndProgramCode([
      { studentCode: `GHOST-${suffix}`, programCode: '2710' },
    ]);

    expect(found).toEqual([]);
  });

  it('IP4: returns an empty array for an empty input', async () => {
    const found = await repository.findByStudentCodeAndProgramCode([]);

    expect(found).toEqual([]);
  });

  it('IP5: does not match by studentCode alone when the programCode differs', async () => {
    await seedElector(`A-${suffix}`, '2710');

    const found = await repository.findByStudentCodeAndProgramCode([
      { studentCode: `A-${suffix}`, programCode: '9999' },
    ]);

    expect(found).toEqual([]);
  });

  it('IP6: does not match by programCode alone when the studentCode differs', async () => {
    await seedElector(`A-${suffix}`, '2710');

    const found = await repository.findByStudentCodeAndProgramCode([
      { studentCode: `OTHER-${suffix}`, programCode: '2710' },
    ]);

    expect(found).toEqual([]);
  });

  it('IP7: returns mapped domain entities (ElectorEntity instances)', async () => {
    await seedElector(`A-${suffix}`, '2710');

    const found = await repository.findByStudentCodeAndProgramCode([
      { studentCode: `A-${suffix}`, programCode: '2710' },
    ]);

    expect(found[0]).toBeInstanceOf(ElectorEntity);
    expect(found[0].programCode).toBe('2710');
  });

  it('IP8: excludes logically deleted electors from the pair lookup', async () => {
    const deletedCode = `DEL-${suffix}`;
    await seedElector(deletedCode, '2710');
    await seedElector(`KEEP-${suffix}`, '2710');

    await prisma.elector.update({
      where: { student_code: deletedCode },
      data: { deleted_at: new Date() },
    });

    const found = await repository.findByStudentCodeAndProgramCode([
      { studentCode: deletedCode, programCode: '2710' },
      { studentCode: `KEEP-${suffix}`, programCode: '2710' },
    ]);

    expect(found.map((e) => e.studentCode)).toEqual([`KEEP-${suffix}`]);
  });

  it('IP9: still returns an INACTIVE elector that is not deleted', async () => {
    const inactiveCode = `INACT-${suffix}`;
    await seedElector(inactiveCode, '2710');
    await prisma.elector.update({
      where: { student_code: inactiveCode },
      data: { status: 'INACTIVE' },
    });

    const found = await repository.findByStudentCodeAndProgramCode([
      { studentCode: inactiveCode, programCode: '2710' },
    ]);

    expect(found).toHaveLength(1);
    expect(found[0].status).toBe('INACTIVE');
  });
});

describe('PrismaElectorRepository integration - findByElection', () => {
  let prisma: PrismaService;
  let repository: PrismaElectorRepository;

  const suffix = Date.now();
  const usedElectionIds: string[] = [];
  const usedStudentCodes: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaElectorRepository(prisma);
  });

  afterEach(async () => {
    if (usedElectionIds.length > 0) {
      await prisma.electoralRoll.deleteMany({
        where: { election_id: { in: usedElectionIds } },
      });
      await prisma.election.deleteMany({ where: { id: { in: usedElectionIds } } });
      usedElectionIds.length = 0;
    }
    if (usedStudentCodes.length > 0) {
      await prisma.elector.deleteMany({ where: { student_code: { in: usedStudentCodes } } });
      usedStudentCodes.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedElection(): Promise<string> {
    const created = await prisma.election.create({
      data: {
        name: `INT-ROLL-${suffix}-${usedElectionIds.length}`,
        description: 'Integration findByElection election.',
        start_date: new Date(Date.UTC(2026, 9, 1)),
        start_time: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        end_date: new Date(Date.UTC(2026, 9, 1)),
        end_time: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
      },
    });
    usedElectionIds.push(created.id);
    return created.id;
  }

  async function seedElector(
    studentCode: string,
    programCode = '2710',
    opts: { firstName?: string; status?: string } = {},
  ): Promise<string> {
    const created = await prisma.elector.create({
      data: {
        first_name: opts.firstName ?? 'Test',
        last_name: 'Elector',
        email: `${studentCode.toLowerCase()}-${suffix}@example.com`,
        password_hash: 'pbkdf2$placeholder',
        student_code: studentCode,
        program_code: programCode,
        status: opts.status ?? 'ACTIVE',
      },
    });
    usedStudentCodes.push(studentCode);
    return created.id;
  }

  async function seedRoll(electionId: string, electorId: string): Promise<void> {
    await prisma.electoralRoll.create({
      data: { election_id: electionId, elector_id: electorId },
    });
  }

  it('LR-09: returns only electors scoped to the requested election', async () => {
    const electionA = await seedElection();
    const electionB = await seedElection();
    const a1 = await seedElector(`A1-${suffix}`);
    const a2 = await seedElector(`A2-${suffix}`);
    const b1 = await seedElector(`B1-${suffix}`);
    await seedRoll(electionA, a1);
    await seedRoll(electionA, a2);
    await seedRoll(electionB, b1);

    const result = await repository.findByElection({ electionId: electionA, page: 1, limit: 10 });

    expect(result.total).toBe(2);
    expect(result.electors.map((e) => e.studentCode).sort()).toEqual([
      `A1-${suffix}`,
      `A2-${suffix}`,
    ]);
  });

  it('LR-10: an elector registered in two elections appears only in the queried one', async () => {
    const electionA = await seedElection();
    const electionB = await seedElection();
    const shared = await seedElector(`SHARED-${suffix}`);
    await seedRoll(electionA, shared);
    await seedRoll(electionB, shared);

    const resultA = await repository.findByElection({ electionId: electionA, page: 1, limit: 10 });
    const resultB = await repository.findByElection({ electionId: electionB, page: 1, limit: 10 });

    expect(resultA.total).toBe(1);
    expect(resultB.total).toBe(1);
    expect(resultA.electors[0].studentCode).toBe(`SHARED-${suffix}`);
  });

  it('LR-01/LR-02: paginates with an election-scoped total', async () => {
    const electionId = await seedElection();
    for (let i = 1; i <= 3; i++) {
      await seedRoll(electionId, await seedElector(`P-${i}-${suffix}`));
    }

    const page1 = await repository.findByElection({ electionId, page: 1, limit: 2 });
    const page2 = await repository.findByElection({ electionId, page: 2, limit: 2 });

    expect(page1.total).toBe(3);
    expect(page1.electors).toHaveLength(2);
    expect(page2.total).toBe(3);
    expect(page2.electors).toHaveLength(1);
  });

  it('LR-04: filters by partial program code within the election', async () => {
    const electionId = await seedElection();
    await seedRoll(electionId, await seedElector(`PF-1-${suffix}`, '2710'));
    await seedRoll(electionId, await seedElector(`PF-2-${suffix}`, '2811'));

    const result = await repository.findByElection({
      electionId,
      page: 1,
      limit: 10,
      programCode: '271',
    });

    expect(result.total).toBe(1);
    expect(result.electors[0].studentCode).toBe(`PF-1-${suffix}`);
  });

  it('LR-06: filters by partial, case-insensitive name', async () => {
    const electionId = await seedElection();
    await seedRoll(electionId, await seedElector(`NF-1-${suffix}`, '2710', { firstName: 'Janet' }));
    await seedRoll(
      electionId,
      await seedElector(`NF-2-${suffix}`, '2710', { firstName: 'Carlos' }),
    );

    const result = await repository.findByElection({ electionId, page: 1, limit: 10, name: 'jan' });

    expect(result.total).toBe(1);
    expect(result.electors[0].studentCode).toBe(`NF-1-${suffix}`);
  });

  it('LR-07: filters by exact global elector status', async () => {
    const electionId = await seedElection();
    await seedRoll(electionId, await seedElector(`ST-ACT-${suffix}`, '2710', { status: 'ACTIVE' }));
    await seedRoll(
      electionId,
      await seedElector(`ST-INA-${suffix}`, '2710', { status: 'INACTIVE' }),
    );

    const inactive = await repository.findByElection({
      electionId,
      page: 1,
      limit: 10,
      status: 'INACTIVE',
    });

    expect(inactive.total).toBe(1);
    expect(inactive.electors[0].studentCode).toBe(`ST-INA-${suffix}`);
  });

  it('LR-11: excludes soft-deleted electors even when a roll row remains', async () => {
    const electionId = await seedElection();
    const keep = await seedElector(`DEL-KEEP-${suffix}`);
    const del = await seedElector(`DEL-GONE-${suffix}`);
    await seedRoll(electionId, keep);
    await seedRoll(electionId, del);
    await prisma.elector.update({
      where: { id: del },
      data: { deleted_at: new Date() },
    });

    const result = await repository.findByElection({ electionId, page: 1, limit: 10 });

    expect(result.total).toBe(1);
    expect(result.electors[0].studentCode).toBe(`DEL-KEEP-${suffix}`);
  });

  it('LR-12: returns an empty page for an election with no members', async () => {
    const electionId = await seedElection();

    const result = await repository.findByElection({ electionId, page: 1, limit: 10 });

    expect(result).toEqual({ electors: [], total: 0 });
  });

  it('LR-13: maps rows to full ElectorEntity instances', async () => {
    const electionId = await seedElection();
    await seedRoll(electionId, await seedElector(`MAP-${suffix}`, '2710'));

    const result = await repository.findByElection({ electionId, page: 1, limit: 10 });

    expect(result.electors[0]).toBeInstanceOf(ElectorEntity);
    expect(result.electors[0].programCode).toBe('2710');
  });
});
