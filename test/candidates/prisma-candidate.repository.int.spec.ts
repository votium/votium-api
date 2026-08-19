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
});
