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
});
