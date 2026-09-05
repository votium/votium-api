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
});
