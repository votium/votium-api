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

  describe('findByEmail', () => {
    it('I1: returns the elector by exact email', async () => {
      const code = `FEM-1-${suffix}`;
      const email = `fem-1-${suffix}@example.com`;
      usedStudentCodes.push(code);

      await repository.create(buildEntity(code, email));

      const found = await repository.findByEmail(email);

      expect(found).not.toBeNull();
      expect(found?.email).toBe(email);
      expect(found?.studentCode).toBe(code);
    });

    it('I2: matches case-insensitively', async () => {
      const code = `FEM-2-${suffix}`;
      const storedEmail = `Jane.Doe@Example.COM`;
      usedStudentCodes.push(code);

      await repository.create(buildEntity(code, storedEmail));

      const found = await repository.findByEmail('jane.doe@example.com');

      expect(found).not.toBeNull();
      expect(found?.email).toBe(storedEmail);
    });

    it('I3: trims surrounding whitespace in query', async () => {
      const code = `FEM-3-${suffix}`;
      const email = `juan-${suffix}@example.com`;
      usedStudentCodes.push(code);

      await repository.create(buildEntity(code, email));

      const found = await repository.findByEmail(`  ${email}  `);

      expect(found).not.toBeNull();
      expect(found?.email).toBe(email);
    });

    it('I4: returns null when no elector matches', async () => {
      const found = await repository.findByEmail(`nonexistent-${suffix}@example.com`);

      expect(found).toBeNull();
    });

    it('I5: returns a domain ElectorEntity with id and createdAt', async () => {
      const code = `FEM-5-${suffix}`;
      const email = `fem-5-${suffix}@example.com`;
      usedStudentCodes.push(code);

      const saved = await repository.create(buildEntity(code, email));
      const found = await repository.findByEmail(email);

      expect(found).toBeInstanceOf(ElectorEntity);
      expect(found?.id).toBe(saved.id);
      expect(found?.createdAt).toBeInstanceOf(Date);
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

  describe('update', () => {
    async function buildSavedElector(code: string, email: string): Promise<ElectorEntity> {
      usedStudentCodes.push(code);
      return repository.create(buildEntity(code, email));
    }

    it('IE1: persists changed editable fields and returns the updated entity', async () => {
      const code = `UPD-1-${suffix}`;
      const saved = await buildSavedElector(code, `upd-1-${suffix}@example.com`);

      const loaded = await repository.findById(saved.id as string);
      loaded!.update({
        firstName: 'Maria',
        lastName: 'Rodriguez',
        studentCode: `UPD-1B-${suffix}`,
        programCode: '2715',
      });
      usedStudentCodes.push(`UPD-1B-${suffix}`);

      const updated = await repository.update(loaded!);

      expect(updated).not.toBeNull();
      expect(updated?.id).toBe(saved.id);
      expect(updated?.firstName).toBe('Maria');
      expect(updated?.lastName).toBe('Rodriguez');
      expect(updated?.studentCode).toBe(`UPD-1B-${suffix}`);
      expect(updated?.programCode).toBe('2715');
      expect(updated?.email).toBe(`upd-1-${suffix}@example.com`);
    });

    it('IE2: only updates the targeted elector', async () => {
      const codeA = `UPD-2A-${suffix}`;
      const codeB = `UPD-2B-${suffix}`;
      const savedA = await buildSavedElector(codeA, `upd-2a-${suffix}@example.com`);
      const savedB = await buildSavedElector(codeB, `upd-2b-${suffix}@example.com`);

      const loadedA = await repository.findById(savedA.id as string);
      loadedA!.update({ firstName: 'Maria' });
      await repository.update(loadedA!);

      const untouched = await repository.findById(savedB.id as string);
      expect(untouched?.firstName).toBe('Juan');
      expect(untouched?.id).toBe(savedB.id);
    });

    it('IE3: returns null for a nonexistent id', async () => {
      const entity = buildEntity(`UPD-3-${suffix}`, `upd-3-${suffix}@example.com`);
      usedStudentCodes.push(`UPD-3-${suffix}`);
      const missing = ElectorEntity.restore({
        id: crypto.randomUUID(),
        firstName: entity.firstName,
        lastName: entity.lastName,
        email: entity.email,
        passwordHash: entity.passwordHash,
        studentCode: entity.studentCode,
        programCode: entity.programCode,
        status: entity.status,
        createdAt: new Date(),
      });

      const updated = await repository.update(missing);

      expect(updated).toBeNull();
    });

    it('IE4: throws ElectorDuplicateError when the email conflicts', async () => {
      const targetCode = `UPD-4A-${suffix}`;
      const conflictCode = `UPD-4B-${suffix}`;
      const conflictEmail = `upd-4-conflict-${suffix}@example.com`;
      const target = await buildSavedElector(targetCode, `upd-4a-${suffix}@example.com`);
      await buildSavedElector(conflictCode, conflictEmail);

      const loaded = await repository.findById(target.id as string);
      loaded!.update({ email: conflictEmail });

      await expect(repository.update(loaded!)).rejects.toBeInstanceOf(ElectorDuplicateError);
    });

    it('IE5: throws ElectorDuplicateError when the student code conflicts', async () => {
      const targetCode = `UPD-5A-${suffix}`;
      const conflictCode = `UPD-5B-${suffix}`;
      const target = await buildSavedElector(targetCode, `upd-5a-${suffix}@example.com`);
      await buildSavedElector(conflictCode, `upd-5b-${suffix}@example.com`);

      const loaded = await repository.findById(target.id as string);
      loaded!.update({ studentCode: conflictCode });

      await expect(repository.update(loaded!)).rejects.toBeInstanceOf(ElectorDuplicateError);
    });

    it('IE6: keeps id, createdAt, status, and passwordHash unchanged', async () => {
      const code = `UPD-6-${suffix}`;
      const saved = await buildSavedElector(code, `upd-6-${suffix}@example.com`);

      const loaded = await repository.findById(saved.id as string);
      const createdAt = loaded!.createdAt as Date;
      loaded!.update({ firstName: 'Maria' });

      const updated = await repository.update(loaded!);

      expect(updated?.id).toBe(saved.id);
      expect(updated?.createdAt).toEqual(createdAt);
      expect(updated?.status).toBe(ElectorEntity.DEFAULT_STATUS);
      expect(updated?.passwordHash).toBe('pbkdf2$210000$salt$hash');
    });
  });

  describe('softDelete', () => {
    async function seed(code: string, email: string): Promise<ElectorEntity> {
      usedStudentCodes.push(code);
      return repository.create(buildEntity(code, email));
    }

    it('SE-1: softDelete(id) sets deleted_at and returns the entity with deletedAt', async () => {
      const code = `SD-${suffix}`;
      const saved = await seed(code, `sd-${suffix}@example.com`);

      const deleted = await repository.softDelete(saved.id as string);

      expect(deleted).not.toBeNull();
      expect(deleted!.id).toBe(saved.id);
      expect(deleted!.deletedAt).toBeInstanceOf(Date);

      const row = await prisma.elector.findUnique({ where: { id: saved.id as string } });
      expect(row).not.toBeNull();
      expect(row!.deleted_at).toBeInstanceOf(Date);
      expect(row!.status).toBe(ElectorEntity.DEFAULT_STATUS);
    });

    it('SE-2: findById excludes a logically deleted elector', async () => {
      const code = `SDFIND-${suffix}`;
      const saved = await seed(code, `sdfind-${suffix}@example.com`);

      await repository.softDelete(saved.id as string);

      expect(await repository.findById(saved.id as string)).toBeNull();
    });

    it('SE-3: findByEmail excludes a logically deleted elector', async () => {
      const code = `SDMAIL-${suffix}`;
      const email = `sdmail-${suffix}@example.com`;
      const saved = await seed(code, email);

      await repository.softDelete(saved.id as string);

      expect(await repository.findByEmail(email)).toBeNull();
    });

    it('SE-4: search excludes deleted electors and keeps total consistent', async () => {
      const code = `SDSRCH-${suffix}`;
      const saved = await seed(code, `sdsrch-${suffix}@example.com`);
      await repository.softDelete(saved.id as string);

      const result = await repository.search({ page: 1, limit: 100, studentCode: code });

      expect(result.electors).toEqual([]);
      expect(result.total).toBe(0);
      const count = await prisma.elector.count({ where: { student_code: code } });
      expect(count).toBe(1);
    });

    it('SE-5: findByStudentCodeOrEmail still includes deleted electors (duplicate detection)', async () => {
      const code = `SDDUP-${suffix}`;
      const email = `sddup-${suffix}@example.com`;
      const saved = await seed(code, email);
      await repository.softDelete(saved.id as string);

      const byCode = await repository.findByStudentCodeOrEmail([code], []);
      const byEmail = await repository.findByStudentCodeOrEmail([], [email]);

      expect(byCode.map((e) => e.id)).toContain(saved.id);
      expect(byEmail.map((e) => e.id)).toContain(saved.id);
    });

    it('SE-6: create with the student_code/email of a deleted elector throws ElectorDuplicateError', async () => {
      const code = `SDUNIQ-${suffix}`;
      const email = `sduniq-${suffix}@example.com`;
      const saved = await seed(code, email);
      await repository.softDelete(saved.id as string);

      await expect(
        repository.create(buildEntity(code, `other-${suffix}@example.com`)),
      ).rejects.toBeInstanceOf(ElectorDuplicateError);
      await expect(repository.create(buildEntity(`OTHER-${suffix}`, email))).rejects.toBeInstanceOf(
        ElectorDuplicateError,
      );
      usedStudentCodes.push(`OTHER-${suffix}`);
    });

    it('SE-7: updateStatus on a deleted row does not clear deleted_at', async () => {
      const code = `SDSTAT-${suffix}`;
      const saved = await seed(code, `sdstat-${suffix}@example.com`);
      await repository.softDelete(saved.id as string);

      await repository.updateStatus(saved.id as string, ElectorEntity.DEFAULT_STATUS);

      expect(await repository.findById(saved.id as string)).toBeNull();
      const row = await prisma.elector.findUnique({ where: { id: saved.id as string } });
      expect(row!.deleted_at).toBeInstanceOf(Date);
    });

    it('SE-8: softDelete on a missing id returns null (P2025)', async () => {
      const deleted = await repository.softDelete(crypto.randomUUID());

      expect(deleted).toBeNull();
    });
  });

  describe('search', () => {
    async function seedSearchElector(
      studentCode: string,
      email: string,
      overrides: {
        firstName?: string;
        lastName?: string;
        programCode?: string;
        status?: string;
        identification?: string | null;
      } = {},
    ): Promise<ElectorEntity> {
      usedStudentCodes.push(studentCode);
      return repository.create(
        ElectorEntity.create({
          firstName: overrides.firstName ?? 'Juan',
          lastName: overrides.lastName ?? 'Garcia',
          email,
          passwordHash: 'pbkdf2$210000$salt$hash',
          studentCode,
          programCode: overrides.programCode ?? '2710',
          status: overrides.status,
          identification: overrides.identification,
        }),
      );
    }

    it('IS-01: studentCode prefix substring match', async () => {
      const code = `SM-${suffix}-MID-202012345`;
      await seedSearchElector(code, `sm-${suffix}@example.com`);

      const result = await repository.search({
        page: 1,
        limit: 100,
        studentCode: `SM-${suffix}-MI`,
      });

      expect(result.total).toBe(1);
      expect(result.electors[0].studentCode).toBe(code);
    });

    it('IS-02: studentCode middle substring match', async () => {
      const code = `SM-${suffix}-MID-202012345`;
      await seedSearchElector(code, `sm2-${suffix}@example.com`);

      const result = await repository.search({ page: 1, limit: 100, studentCode: 'ID-2020' });

      expect(result.total).toBe(1);
      expect(result.electors[0].studentCode).toBe(code);
    });

    it('IS-03: studentCode exact/full value still matches', async () => {
      const code = `SM-${suffix}-MID-202012345`;
      await seedSearchElector(code, `sm3-${suffix}@example.com`);

      const result = await repository.search({ page: 1, limit: 100, studentCode: code });

      expect(result.total).toBe(1);
      expect(result.electors[0].studentCode).toBe(code);
    });

    it('IS-04: studentCode non-matching value returns nothing', async () => {
      await seedSearchElector(`SM-${suffix}-MID-202012345`, `sm4-${suffix}@example.com`);

      const result = await repository.search({
        page: 1,
        limit: 100,
        studentCode: `NOPE-${suffix}`,
      });

      expect(result.electors).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('IS-05: programCode prefix substring match returns all matching rows', async () => {
      await seedSearchElector(`PM-${suffix}-1`, `pm1-${suffix}@example.com`, {
        programCode: '2710',
      });
      await seedSearchElector(`PM-${suffix}-2`, `pm2-${suffix}@example.com`, {
        programCode: '2715',
      });
      await seedSearchElector(`PM-${suffix}-3`, `pm3-${suffix}@example.com`, {
        programCode: '9999',
      });

      const result = await repository.search({
        page: 1,
        limit: 100,
        studentCode: `PM-${suffix}`,
        programCode: '271',
      });

      expect(result.total).toBe(2);
      expect(result.electors.map((e) => e.programCode).sort()).toEqual(['2710', '2715']);
    });

    it('IS-06: programCode middle substring match', async () => {
      await seedSearchElector(`PM-${suffix}-4`, `pm4-${suffix}@example.com`, {
        programCode: '2710',
      });
      await seedSearchElector(`PM-${suffix}-5`, `pm5-${suffix}@example.com`, {
        programCode: '0088',
      });

      const result = await repository.search({
        page: 1,
        limit: 100,
        studentCode: `PM-${suffix}`,
        programCode: '71',
      });

      expect(result.total).toBe(1);
      expect(result.electors[0].programCode).toBe('2710');
    });

    it('IS-07: programCode exact/full value still matches', async () => {
      await seedSearchElector(`PM-${suffix}-6`, `pm6-${suffix}@example.com`, {
        programCode: '2710',
      });

      const result = await repository.search({
        page: 1,
        limit: 100,
        studentCode: `PM-${suffix}-6`,
        programCode: '2710',
      });

      expect(result.total).toBe(1);
      expect(result.electors[0].programCode).toBe('2710');
    });

    it('IS-08: programCode non-matching value returns nothing', async () => {
      await seedSearchElector(`PM-${suffix}-7`, `pm7-${suffix}@example.com`, {
        programCode: '2710',
      });

      const result = await repository.search({
        page: 1,
        limit: 100,
        studentCode: `PM-${suffix}-7`,
        programCode: '9999',
      });

      expect(result.electors).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('IS-09: name matches the first name (partial, case-insensitive)', async () => {
      await seedSearchElector(`NM-${suffix}-1`, `nm1-${suffix}@example.com`, {
        firstName: 'Juan Camilo',
        lastName: 'Garcia Saenz',
      });

      const result = await repository.search({
        page: 1,
        limit: 100,
        studentCode: `NM-${suffix}-1`,
        name: 'juan cam',
      });

      expect(result.total).toBe(1);
      expect(result.electors[0].firstName).toBe('Juan Camilo');
    });

    it('IS-10: name matches the last name / surname (partial, case-insensitive)', async () => {
      await seedSearchElector(`NM-${suffix}-2`, `nm2-${suffix}@example.com`, {
        firstName: 'Juan Camilo',
        lastName: 'Garcia Saenz',
      });

      const result = await repository.search({
        page: 1,
        limit: 100,
        studentCode: `NM-${suffix}-2`,
        name: 'saenz',
      });

      expect(result.total).toBe(1);
      expect(result.electors[0].lastName).toBe('Garcia Saenz');
    });

    it('IS-11: name matching neither field returns nothing', async () => {
      await seedSearchElector(`NM-${suffix}-3`, `nm3-${suffix}@example.com`, {
        firstName: 'Juan Camilo',
        lastName: 'Garcia Saenz',
      });

      const result = await repository.search({
        page: 1,
        limit: 100,
        studentCode: `NM-${suffix}-3`,
        name: 'nobody',
      });

      expect(result.electors).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('IS-12: name search is case-insensitive for both fields', async () => {
      await seedSearchElector(`NM-${suffix}-4`, `nm4-${suffix}@example.com`, {
        firstName: 'Juan Camilo',
        lastName: 'Garcia Saenz',
      });

      const byFirstName = await repository.search({
        page: 1,
        limit: 100,
        studentCode: `NM-${suffix}-4`,
        name: 'JUAN CAMILO',
      });
      const byLastName = await repository.search({
        page: 1,
        limit: 100,
        studentCode: `NM-${suffix}-4`,
        name: 'gArCiA',
      });

      expect(byFirstName.total).toBe(1);
      expect(byLastName.total).toBe(1);
    });

    it('IS-13: combined studentCode + programCode filters combine with AND', async () => {
      await seedSearchElector(`CB-${suffix}-1`, `cb1-${suffix}@example.com`, {
        programCode: '2710',
      });
      await seedSearchElector(`CB-${suffix}-2`, `cb2-${suffix}@example.com`, {
        programCode: '2715',
      });

      const result = await repository.search({
        page: 1,
        limit: 100,
        studentCode: `CB-${suffix}`,
        programCode: '2710',
      });

      expect(result.total).toBe(1);
      expect(result.electors[0].studentCode).toBe(`CB-${suffix}-1`);
    });

    it('IS-14: combined name + studentCode + programCode filters narrow to the intersection', async () => {
      await seedSearchElector(`CC-${suffix}-1`, `cc1-${suffix}@example.com`, {
        firstName: 'Maria',
        lastName: 'Rodriguez',
        programCode: '2710',
      });
      await seedSearchElector(`CC-${suffix}-2`, `cc2-${suffix}@example.com`, {
        firstName: 'Maria',
        lastName: 'Perez',
        programCode: '2715',
      });

      const result = await repository.search({
        page: 1,
        limit: 100,
        name: 'maria',
        studentCode: `CC-${suffix}`,
        programCode: '2710',
      });

      expect(result.total).toBe(1);
      expect(result.electors[0].studentCode).toBe(`CC-${suffix}-1`);
    });

    it('IS-15: empty and whitespace-only filters are ignored', async () => {
      await seedSearchElector(`WS-${suffix}-1`, `ws1-${suffix}@example.com`);
      await seedSearchElector(`WS-${suffix}-2`, `ws2-${suffix}@example.com`);

      const baseline = await repository.search({
        page: 1,
        limit: 100,
        studentCode: `WS-${suffix}`,
      });
      const filtered = await repository.search({
        page: 1,
        limit: 100,
        studentCode: `WS-${suffix}`,
        name: '   ',
        programCode: '  ',
      });

      expect(filtered.total).toBe(baseline.total);
      expect(filtered.electors.map((e) => e.id).sort()).toEqual(
        baseline.electors.map((e) => e.id).sort(),
      );
    });

    it('IS-16: search excludes logically deleted electors and keeps the row in the database', async () => {
      const code = `SD-IS16-${suffix}`;
      const saved = await seedSearchElector(code, `sd-is16-${suffix}@example.com`);
      await repository.softDelete(saved.id as string);

      const result = await repository.search({ page: 1, limit: 100, studentCode: code });

      expect(result.electors).toEqual([]);
      expect(result.total).toBe(0);

      const count = await prisma.elector.count({ where: { student_code: code } });
      expect(count).toBe(1);
    });

    it('IS-17: filtering happens at the database level (findMany where includes contains)', async () => {
      const code = `DBL-${suffix}-2020`;
      await seedSearchElector(code, `dbl-${suffix}@example.com`);

      const findManySpy = jest.spyOn(prisma.elector, 'findMany');

      try {
        await repository.search({ page: 1, limit: 100, studentCode: `DBL-${suffix}` });

        expect(findManySpy.mock.calls[0][0]?.where).toEqual(
          expect.objectContaining({
            student_code: { contains: `DBL-${suffix}` },
          }),
        );
      } finally {
        findManySpy.mockRestore();
      }
    });

    it('IS-18: pagination with a partial filter keeps the global total', async () => {
      const first = await seedSearchElector(`PG-${suffix}-1`, `pg1-${suffix}@example.com`, {
        firstName: 'PaginationOne',
      });
      const second = await seedSearchElector(`PG-${suffix}-2`, `pg2-${suffix}@example.com`, {
        firstName: 'PaginationTwo',
      });
      const third = await seedSearchElector(`PG-${suffix}-3`, `pg3-${suffix}@example.com`, {
        firstName: 'PaginationThree',
      });

      await prisma.elector.update({
        where: { id: first.id },
        data: { created_at: new Date('2026-01-01T00:00:00.000Z') },
      });
      await prisma.elector.update({
        where: { id: second.id },
        data: { created_at: new Date('2026-06-01T00:00:00.000Z') },
      });
      await prisma.elector.update({
        where: { id: third.id },
        data: { created_at: new Date('2026-12-01T00:00:00.000Z') },
      });

      const result = await repository.search({
        page: 2,
        limit: 2,
        studentCode: `PG-${suffix}`,
        name: 'Pagination',
      });

      expect(result.total).toBe(3);
      expect(result.electors).toHaveLength(1);
      expect(result.electors[0].firstName).toBe('PaginationOne');
    });

    it('IS-19: results are ordered by created_at descending regardless of filters', async () => {
      const older = await seedSearchElector(`ORD-${suffix}-1`, `ord1-${suffix}@example.com`);
      const middle = await seedSearchElector(`ORD-${suffix}-2`, `ord2-${suffix}@example.com`);
      const newer = await seedSearchElector(`ORD-${suffix}-3`, `ord3-${suffix}@example.com`);

      await prisma.elector.update({
        where: { id: older.id },
        data: { created_at: new Date('2026-01-01T00:00:00.000Z') },
      });
      await prisma.elector.update({
        where: { id: middle.id },
        data: { created_at: new Date('2026-06-01T00:00:00.000Z') },
      });
      await prisma.elector.update({
        where: { id: newer.id },
        data: { created_at: new Date('2026-12-01T00:00:00.000Z') },
      });

      const result = await repository.search({
        page: 1,
        limit: 100,
        studentCode: `ORD-${suffix}`,
      });

      expect(result.electors.map((e) => e.id)).toEqual([newer.id, middle.id, older.id]);
    });

    it('IS-20: studentCode and programCode matching keeps the default case-sensitive contains', async () => {
      await seedSearchElector(`ABC${suffix}`, `cs-upper-${suffix}@example.com`);
      await seedSearchElector(`abc${suffix}`, `cs-lower-${suffix}@example.com`);

      const result = await repository.search({
        page: 1,
        limit: 100,
        studentCode: `abc${suffix}`,
      });

      expect(result.total).toBe(1);
      expect(result.electors[0].studentCode).toBe(`abc${suffix}`);
    });

    it('IE-S-01: status ACTIVE returns only ACTIVE rows', async () => {
      const active1 = await seedSearchElector(`ST-A-${suffix}-1`, `st-a1-${suffix}@example.com`, {
        status: 'ACTIVE',
      });
      const active2 = await seedSearchElector(`ST-A-${suffix}-2`, `st-a2-${suffix}@example.com`, {
        status: 'ACTIVE',
      });
      await seedSearchElector(`ST-A-${suffix}-3`, `st-a3-${suffix}@example.com`, {
        status: 'INACTIVE',
      });

      const result = await repository.search({
        page: 1,
        limit: 100,
        studentCode: `ST-A-${suffix}`,
        status: 'ACTIVE',
      });

      expect(result.total).toBe(2);
      expect(result.electors.map((e) => e.id).sort()).toEqual([active1.id, active2.id].sort());
    });

    it('IE-S-02: status INACTIVE returns only INACTIVE rows', async () => {
      await seedSearchElector(`ST-I-${suffix}-1`, `st-i1-${suffix}@example.com`, {
        status: 'ACTIVE',
      });
      const inactive = await seedSearchElector(`ST-I-${suffix}-2`, `st-i2-${suffix}@example.com`, {
        status: 'INACTIVE',
      });

      const result = await repository.search({
        page: 1,
        limit: 100,
        studentCode: `ST-I-${suffix}`,
        status: 'INACTIVE',
      });

      expect(result.total).toBe(1);
      expect(result.electors[0].id).toBe(inactive.id);
    });

    it('IE-S-03: identification partial (case-sensitive contains)', async () => {
      await seedSearchElector(`ID-${suffix}-1`, `id1-${suffix}@example.com`, {
        identification: '1001234567',
      });
      await seedSearchElector(`ID-${suffix}-2`, `id2-${suffix}@example.com`, {
        identification: '2001234567',
      });

      const first = await repository.search({
        page: 1,
        limit: 100,
        studentCode: `ID-${suffix}`,
        identification: '1001',
      });
      const second = await repository.search({
        page: 1,
        limit: 100,
        studentCode: `ID-${suffix}`,
        identification: '200',
      });
      const none = await repository.search({
        page: 1,
        limit: 100,
        studentCode: `ID-${suffix}`,
        identification: '900',
      });

      expect(first.total).toBe(1);
      expect(first.electors[0].identification).toBe('1001234567');
      expect(second.total).toBe(1);
      expect(second.electors[0].identification).toBe('2001234567');
      expect(none.total).toBe(0);
    });

    it('IE-S-04: empty/whitespace identification behaves like no filter', async () => {
      await seedSearchElector(`EW-${suffix}-1`, `ew1-${suffix}@example.com`, {
        identification: '1001234567',
      });
      await seedSearchElector(`EW-${suffix}-2`, `ew2-${suffix}@example.com`);

      const baseline = await repository.search({
        page: 1,
        limit: 100,
        studentCode: `EW-${suffix}`,
      });
      const filteredEmpty = await repository.search({
        page: 1,
        limit: 100,
        studentCode: `EW-${suffix}`,
        identification: '',
      });
      const filteredSpaces = await repository.search({
        page: 1,
        limit: 100,
        studentCode: `EW-${suffix}`,
        identification: '   ',
      });

      expect(filteredEmpty.total).toBe(baseline.total);
      expect(filteredSpaces.total).toBe(baseline.total);
    });

    it('IE-S-05: status INACTIVE excludes logically deleted rows', async () => {
      const inactive = await seedSearchElector(`SD-IN-${suffix}`, `sd-in-${suffix}@example.com`, {
        status: 'INACTIVE',
      });
      await repository.softDelete(inactive.id as string);

      const result = await repository.search({
        page: 1,
        limit: 100,
        studentCode: `SD-IN-${suffix}`,
        status: 'INACTIVE',
      });

      expect(result.total).toBe(0);
      const count = await prisma.elector.count({
        where: { student_code: `SD-IN-${suffix}` },
      });
      expect(count).toBe(1);
    });

    it('IE-S-06: combined status + identification + existing filters narrow to the intersection (AND)', async () => {
      await seedSearchElector(`CB2-${suffix}-1`, `cb2-1-${suffix}@example.com`, {
        firstName: 'Maria',
        programCode: '2710',
        status: 'ACTIVE',
        identification: '1001234567',
      });
      await seedSearchElector(`CB2-${suffix}-2`, `cb2-2-${suffix}@example.com`, {
        firstName: 'Maria',
        programCode: '2710',
        status: 'INACTIVE',
        identification: '2001234567',
      });
      await seedSearchElector(`CB2-${suffix}-3`, `cb2-3-${suffix}@example.com`, {
        firstName: 'Maria',
        programCode: '2715',
        status: 'ACTIVE',
        identification: '3001234567',
      });

      const result = await repository.search({
        page: 1,
        limit: 100,
        studentCode: `CB2-${suffix}`,
        status: 'ACTIVE',
        identification: '1001',
        programCode: '2710',
      });

      expect(result.total).toBe(1);
      expect(result.electors[0].studentCode).toBe(`CB2-${suffix}-1`);
    });
  });

  describe('update identification / updated_at', () => {
    async function buildSavedElector(code: string, email: string): Promise<ElectorEntity> {
      usedStudentCodes.push(code);
      return repository.create(buildEntity(code, email));
    }

    it('IE-U-01: update persists identification and bumps updated_at without touching created_at', async () => {
      const code = `UPDID-${suffix}`;
      const saved = await buildSavedElector(code, `updid-${suffix}@example.com`);

      const before = await prisma.elector.findUnique({ where: { id: saved.id as string } });
      expect(before?.identification).toBeNull();
      expect(before?.updated_at).toBeInstanceOf(Date);

      await new Promise((resolve) => setTimeout(resolve, 5));

      const loaded = await repository.findById(saved.id as string);
      loaded!.update({ identification: '1001234567' });

      const updated = await repository.update(loaded!);

      expect(updated?.identification).toBe('1001234567');

      const after = await prisma.elector.findUnique({ where: { id: saved.id as string } });
      expect(after?.identification).toBe('1001234567');
      expect(after?.created_at).toEqual(before?.created_at);
      expect(after!.updated_at.getTime()).toBeGreaterThanOrEqual(
        (before?.updated_at as Date).getTime(),
      );
    });

    it('IE-U-02: update sets identification back to null', async () => {
      const code = `UPDNIL-${suffix}`;
      usedStudentCodes.push(code);
      const saved = await repository.create(
        ElectorEntity.create({
          firstName: 'Juan',
          lastName: 'Garcia',
          email: `updnil-${suffix}@example.com`,
          passwordHash: 'pbkdf2$210000$salt$hash',
          studentCode: code,
          programCode: '2710',
          identification: '1001234567',
        }),
      );

      const row = await prisma.elector.findUnique({ where: { id: saved.id as string } });
      const entityWithNullIdentification = ElectorEntity.restore({
        id: row!.id,
        firstName: row!.first_name,
        lastName: row!.last_name,
        email: row!.email,
        passwordHash: row!.password_hash,
        studentCode: row!.student_code,
        programCode: row!.program_code,
        identification: null,
        status: row!.status,
        createdAt: row!.created_at,
        updatedAt: row!.updated_at,
      });

      const updated = await repository.update(entityWithNullIdentification);

      expect(updated?.identification).toBeNull();
      const after = await prisma.elector.findUnique({ where: { id: saved.id as string } });
      expect(after?.identification).toBeNull();
    });

    it('IE-U-03: duplicate identification on update raises ElectorDuplicateError without partial write', async () => {
      const codeA = `UPDDUP-A-${suffix}`;
      const codeB = `UPDDUP-B-${suffix}`;
      usedStudentCodes.push(codeA, codeB);
      const _savedA = await repository.create(
        ElectorEntity.create({
          firstName: 'Juan',
          lastName: 'Garcia',
          email: `upddup-a-${suffix}@example.com`,
          passwordHash: 'pbkdf2$210000$salt$hash',
          studentCode: codeA,
          programCode: '2710',
          identification: '1001234567',
        }),
      );
      const savedB = await repository.create(
        ElectorEntity.create({
          firstName: 'Maria',
          lastName: 'Rodriguez',
          email: `upddup-b-${suffix}@example.com`,
          passwordHash: 'pbkdf2$210000$salt$hash',
          studentCode: codeB,
          programCode: '2710',
          identification: null,
        }),
      );

      const loadedB = await repository.findById(savedB.id as string);
      loadedB!.update({ identification: '1001234567' });

      await expect(repository.update(loadedB!)).rejects.toBeInstanceOf(ElectorDuplicateError);

      const afterB = await prisma.elector.findUnique({ where: { id: savedB.id as string } });
      expect(afterB?.identification).toBeNull();
    });
  });

  describe('findElectionParticipation', () => {
    async function seedElectronWithRoll(
      code: string,
      email: string,
    ): Promise<{ elector: ElectorEntity; election: { id: string } }> {
      usedStudentCodes.push(code);
      const elector = await repository.create(buildEntity(code, email));
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
      return { elector, election: { id: election.id } };
    }

    it('IE-P-01: returns roll memberships with election details and hasVoted', async () => {
      const code = `PART-${suffix}`;
      const { elector, election } = await seedElectronWithRoll(code, `part-${suffix}@example.com`);
      const election2 = await prisma.election.create({
        data: {
          name: `Election Two ${code}`,
          description: 'Integration test election 2',
          start_date: new Date('2026-09-01T00:00:00.000Z'),
          start_time: new Date('2026-09-01T08:00:00.000Z'),
          end_date: new Date('2026-09-15T00:00:00.000Z'),
          end_time: new Date('2026-09-15T18:00:00.000Z'),
        },
      });

      try {
        await prisma.electoralRoll.create({
          data: { election_id: election.id, elector_id: elector.id as string, has_voted: true },
        });
        await prisma.electoralRoll.create({
          data: {
            election_id: election2.id,
            elector_id: elector.id as string,
            has_voted: false,
          },
        });

        const participation = await repository.findElectionParticipation(elector.id as string);

        expect(participation).toHaveLength(2);
        expect(participation).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              electionId: election.id,
              electionName: `Election ${code}`,
              electionStatus: 'CREATED',
              hasVoted: true,
            }),
            expect.objectContaining({
              electionId: election2.id,
              electionName: `Election Two ${code}`,
              electionStatus: 'CREATED',
              hasVoted: false,
            }),
          ]),
        );
      } finally {
        await prisma.electoralRoll.deleteMany({ where: { elector_id: elector.id as string } });
        await prisma.election.deleteMany({
          where: { id: { in: [election.id, election2.id] } },
        });
      }
    });

    it('IE-P-02: returns an empty array for an elector with no rolls', async () => {
      const code = `NOPART-${suffix}`;
      const saved = await repository.create(buildEntity(code, `nopart-${suffix}@example.com`));

      const participation = await repository.findElectionParticipation(saved.id as string);

      expect(participation).toEqual([]);
    });

    it('IE-P-03: preserves the repository order', async () => {
      const code = `PORD-${suffix}`;
      const { elector, election } = await seedElectronWithRoll(code, `pord-${suffix}@example.com`);

      try {
        await prisma.electoralRoll.create({
          data: { election_id: election.id, elector_id: elector.id as string, has_voted: true },
        });

        const participation = await repository.findElectionParticipation(elector.id as string);

        expect(participation).toHaveLength(1);
        expect(participation[0].electionId).toBe(election.id);
        expect(participation[0].hasVoted).toBe(true);
      } finally {
        await prisma.electoralRoll.deleteMany({ where: { elector_id: elector.id as string } });
        await prisma.election.deleteMany({ where: { id: election.id } });
      }
    });
  });
});
