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

  describe('findByStudentCodeOrEmail', () => {
    it('returns rows matching by student_code', async () => {
      const code1 = `Q1-${suffix}`;
      const code2 = `Q2-${suffix}`;
      usedStudentCodes.push(code1, code2);

      await repository.create(buildEntity(code1, `q1-${suffix}@example.com`));
      await repository.create(buildEntity(code2, `q2-${suffix}@example.com`));

      const found = await repository.findByStudentCodeOrEmail([code1], []);

      expect(found).toHaveLength(1);
      expect(found[0].studentCode).toBe(code1);
    });

    it('returns rows matching by email', async () => {
      const code1 = `QE1-${suffix}`;
      const code2 = `QE2-${suffix}`;
      const email1 = `qe1-${suffix}@example.com`;
      const email2 = `qe2-${suffix}@example.com`;
      usedStudentCodes.push(code1, code2);

      await repository.create(buildEntity(code1, email1));
      await repository.create(buildEntity(code2, email2));

      const found = await repository.findByStudentCodeOrEmail([], [email1]);

      expect(found).toHaveLength(1);
      expect(found[0].email).toBe(email1);
    });

    it('returns only the matching rows when values mix matches and non-matches', async () => {
      const codeA = `QA-${suffix}`;
      const codeB = `QB-${suffix}`;
      usedStudentCodes.push(codeA, codeB);

      await repository.create(buildEntity(codeA, `qa-${suffix}@example.com`));
      await repository.create(buildEntity(codeB, `qb-${suffix}@example.com`));

      const found = await repository.findByStudentCodeOrEmail(
        [codeA, 'NONEXISTENT'],
        ['non-existent@example.com'],
      );

      expect(found).toHaveLength(1);
      expect(found[0].studentCode).toBe(codeA);
    });

    it('returns an empty array when nothing matches', async () => {
      const found = await repository.findByStudentCodeOrEmail(
        ['NO-SUCH-CODE'],
        ['no-such@example.com'],
      );

      expect(found).toEqual([]);
    });

    it('returns an empty array when both input arrays are empty', async () => {
      const found = await repository.findByStudentCodeOrEmail([], []);

      expect(found).toEqual([]);
    });

    it('returns rows mapped to domain entities', async () => {
      const code = `QM-${suffix}`;
      usedStudentCodes.push(code);

      await repository.create(buildEntity(code, `qm-${suffix}@example.com`));

      const found = await repository.findByStudentCodeOrEmail([code], []);

      expect(found[0]).toBeInstanceOf(ElectorEntity);
      expect(found[0].id).toBeTruthy();
      expect(found[0].createdAt).toBeInstanceOf(Date);
    });
  });

  describe('findById and updateStatus', () => {
    it('I1: returns the created elector by id', async () => {
      const code = `DEL-1-${suffix}`;
      const email = `del-1-${suffix}@example.com`;
      usedStudentCodes.push(code);

      const saved = await repository.create(buildEntity(code, email));

      const found = await repository.findById(saved.id as string);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(saved.id);
      expect(found?.firstName).toBe('Juan');
      expect(found?.lastName).toBe('Garcia');
      expect(found?.email).toBe(email);
      expect(found?.passwordHash).toBe('pbkdf2$210000$salt$hash');
      expect(found?.studentCode).toBe(code);
      expect(found?.programCode).toBe('2710');
      expect(found?.status).toBe(ElectorEntity.DEFAULT_STATUS);
      expect(found?.createdAt).toBeInstanceOf(Date);
    });

    it('I2: returns null when the id does not exist', async () => {
      const found = await repository.findById(crypto.randomUUID());

      expect(found).toBeNull();
    });

    it('I3: updates the status to INACTIVE and keeps the record in the database', async () => {
      const code = `DEL-3-${suffix}`;
      usedStudentCodes.push(code);

      const saved = await repository.create(buildEntity(code, `del-3-${suffix}@example.com`));

      const updated = await repository.updateStatus(
        saved.id as string,
        ElectorEntity.INACTIVE_STATUS,
      );

      expect(updated).not.toBeNull();
      expect(updated?.id).toBe(saved.id);
      expect(updated?.status).toBe(ElectorEntity.INACTIVE_STATUS);

      const stillThere = await repository.findById(saved.id as string);
      expect(stillThere).not.toBeNull();
      expect(stillThere?.status).toBe(ElectorEntity.INACTIVE_STATUS);
    });

    it('I4: preserves all other fields when updating the status', async () => {
      const code = `DEL-4-${suffix}`;
      usedStudentCodes.push(code);

      const saved = await repository.create(buildEntity(code, `del-4-${suffix}@example.com`));

      const updated = await repository.updateStatus(
        saved.id as string,
        ElectorEntity.INACTIVE_STATUS,
      );

      expect(updated?.firstName).toBe('Juan');
      expect(updated?.lastName).toBe('Garcia');
      expect(updated?.email).toBe(`del-4-${suffix}@example.com`);
      expect(updated?.passwordHash).toBe('pbkdf2$210000$salt$hash');
      expect(updated?.studentCode).toBe(code);
      expect(updated?.programCode).toBe('2710');
      expect(updated?.createdAt).toBeInstanceOf(Date);
    });

    it('I5: returns null when updating a nonexistent id and creates nothing', async () => {
      const missingId = crypto.randomUUID();

      const updated = await repository.updateStatus(missingId, ElectorEntity.INACTIVE_STATUS);

      expect(updated).toBeNull();

      const count = await prisma.elector.count({ where: { id: missingId } });
      expect(count).toBe(0);
    });

    it('I6: issues an update with only the status field and never deletes', async () => {
      const code = `DEL-6-${suffix}`;
      usedStudentCodes.push(code);

      const saved = await repository.create(buildEntity(code, `del-6-${suffix}@example.com`));

      const updateSpy = jest.spyOn(prisma.elector, 'update');
      const deleteSpy = jest.spyOn(prisma.elector, 'delete');
      const deleteManySpy = jest.spyOn(prisma.elector, 'deleteMany');

      await repository.updateStatus(saved.id as string, ElectorEntity.INACTIVE_STATUS);

      expect(updateSpy).toHaveBeenCalledWith({
        where: { id: saved.id },
        data: { status: ElectorEntity.INACTIVE_STATUS },
      });
      expect(deleteSpy).not.toHaveBeenCalled();
      expect(deleteManySpy).not.toHaveBeenCalled();
    });

    it('I7: preserves related electoral rolls when updating the status', async () => {
      const code = `DEL-7-${suffix}`;
      usedStudentCodes.push(code);

      const saved = await repository.create(buildEntity(code, `del-7-${suffix}@example.com`));

      const election = await prisma.election.create({
        data: {
          name: `Election ${code}`,
          description: 'Integration test election',
          start_date: new Date('2026-09-01T00:00:00.000Z'),
          start_time: new Date('2026-09-01T08:00:00.000Z'),
          end_date: new Date('2026-09-15T00:00:00.000Z'),
          end_time: new Date('2026-09-15T18:00:00.000Z'),
        },
      });

      try {
        await prisma.electoralRoll.create({
          data: {
            election_id: election.id,
            elector_id: saved.id as string,
          },
        });

        await repository.updateStatus(saved.id as string, ElectorEntity.INACTIVE_STATUS);

        const rollCount = await prisma.electoralRoll.count({
          where: { elector_id: saved.id as string },
        });
        expect(rollCount).toBe(1);
      } finally {
        await prisma.electoralRoll.deleteMany({ where: { elector_id: saved.id as string } });
        await prisma.election.delete({ where: { id: election.id } });
      }
    });

    it('I8: findById returns the same id with INACTIVE status after updateStatus', async () => {
      const code = `DEL-8-${suffix}`;
      usedStudentCodes.push(code);

      const saved = await repository.create(buildEntity(code, `del-8-${suffix}@example.com`));

      await repository.updateStatus(saved.id as string, ElectorEntity.INACTIVE_STATUS);

      const found = await repository.findById(saved.id as string);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(saved.id);
      expect(found?.status).toBe(ElectorEntity.INACTIVE_STATUS);
    });
  });
});
