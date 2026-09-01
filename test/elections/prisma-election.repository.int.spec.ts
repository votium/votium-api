import { PrismaService } from '../../src/shared/database/prisma.service';
import { ElectionEntity } from '../../src/modules/elections/domain/entities/election.entity';
import { ElectionNameConflictError } from '../../src/modules/elections/domain/errors/election-name-conflict.error';
import { ElectionNotFoundError } from '../../src/modules/elections/domain/errors/election-not-found.error';
import { PrismaElectionRepository } from '../../src/modules/elections/infrastructure/repositories/prisma-election.repository';

describe('PrismaElectionRepository integration', () => {
  let prisma: PrismaService;
  let repository: PrismaElectionRepository;

  const suffix = Date.now();
  const usedNames: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaElectionRepository(prisma);
  });

  afterEach(async () => {
    if (usedNames.length > 0) {
      await prisma.election.deleteMany({ where: { name: { in: usedNames } } });
      usedNames.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function buildEntity(name: string): ElectionEntity {
    return ElectionEntity.create({
      name,
      description: 'Integration test election.',
      startDate: new Date(Date.UTC(2026, 9, 1)),
      startTime: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
      endDate: new Date(Date.UTC(2026, 9, 1)),
      endTime: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
    });
  }

  it('persists an election and returns a Prisma-generated id and createdAt', async () => {
    const name = `INT-${suffix}`;
    usedNames.push(name);

    const saved = await repository.create(buildEntity(name));

    expect(saved.id).toBeTruthy();
    expect(saved.id).not.toBeNull();
    expect(saved.createdAt).toBeInstanceOf(Date);
  });

  it('stores all provided fields and defaults correctly', async () => {
    const name = `FIELDS-${suffix}`;
    usedNames.push(name);

    const saved = await repository.create(buildEntity(name));

    expect(saved).toEqual(
      expect.objectContaining({
        name,
        description: 'Integration test election.',
        currentStatus: 'CREATED',
        blankVoteEnabled: false,
      }),
    );
    expect(saved.startDate).toBeInstanceOf(Date);
    expect(saved.endDate).toBeInstanceOf(Date);
  });

  it('stores the date/time components correctly in the database', async () => {
    const name = `DATE-${suffix}`;
    usedNames.push(name);

    await repository.create(buildEntity(name));

    const row = await prisma.election.findUnique({ where: { name } });
    expect(row).not.toBeNull();
    expect(row!.current_status).toBe('CREATED');
    expect(row!.blank_vote_enabled).toBe(false);
    expect(row!.start_date.getUTCFullYear()).toBe(2026);
    expect(row!.start_date.getUTCMonth()).toBe(9);
    expect(row!.start_date.getUTCDate()).toBe(1);
    expect(row!.start_time.getUTCHours()).toBe(8);
    expect(row!.start_time.getUTCMinutes()).toBe(0);
  });

  it('rejects a duplicate name with ElectionNameConflictError (P2002)', async () => {
    const name = `DUP-${suffix}`;
    usedNames.push(name);

    await repository.create(buildEntity(name));

    await expect(repository.create(buildEntity(name))).rejects.toBeInstanceOf(
      ElectionNameConflictError,
    );
  });

  it('never updates the original row when a duplicate name is rejected', async () => {
    const name = `NOUPD-${suffix}`;
    usedNames.push(name);

    await repository.create(buildEntity(name));

    await expect(repository.create(buildEntity(name))).rejects.toBeInstanceOf(
      ElectionNameConflictError,
    );

    const rows = await prisma.election.findMany({ where: { name } });
    expect(rows).toHaveLength(1);
  });

  describe('findById', () => {
    it('returns the entity for an existing election', async () => {
      const name = `FIND-${suffix}`;
      usedNames.push(name);
      const saved = await repository.create(buildEntity(name));
      const found = await repository.findById(saved.id as string);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(saved.id);
      expect(found!.name).toBe(name);
    });

    it('returns null for a missing election', async () => {
      const found = await repository.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  describe('update', () => {
    it('persists editable fields and returns the updated entity', async () => {
      const name = `UPD-${suffix}`;
      usedNames.push(name);
      const saved = await repository.create(buildEntity(name));
      saved.update({ name: `${name}-edited`, description: 'Edited', blankVoteEnabled: true });
      const updated = await repository.update(saved);
      expect(updated.name).toBe(`${name}-edited`);
      expect(updated.blankVoteEnabled).toBe(true);
    });

    it('leaves id, current_status and created_at unchanged', async () => {
      const name = `IMM-${suffix}`;
      usedNames.push(name);
      const saved = await repository.create(buildEntity(name));
      const updated = await repository.update(saved);
      expect(updated.id).toBe(saved.id);
      expect(updated.currentStatus).toBe('CREATED');
      expect(updated.createdAt).toEqual(saved.createdAt);
    });

    it('rejects a duplicate name with ElectionNameConflictError (P2002)', async () => {
      const a = `DUP-A-${suffix}`;
      const b = `DUP-B-${suffix}`;
      usedNames.push(a, b);
      const electionA = await repository.create(buildEntity(a));
      const electionB = await repository.create(buildEntity(b));
      electionB.update({ name: a });
      await expect(repository.update(electionB)).rejects.toBeInstanceOf(ElectionNameConflictError);
      expect(await prisma.election.findMany({ where: { name: a } })).toHaveLength(1);
      void electionA;
    });

    it('self-rename (same name) succeeds', async () => {
      const name = `SELF-${suffix}`;
      usedNames.push(name);
      const saved = await repository.create(buildEntity(name));
      saved.update({ name });
      await expect(repository.update(saved)).resolves.toBeDefined();
    });

    it('rejects with ElectionNotFoundError when the row is gone (P2025)', async () => {
      const name = `GONE-${suffix}`;
      usedNames.push(name);
      const saved = await repository.create(buildEntity(name));
      await prisma.election.delete({ where: { id: saved.id as string } });
      await expect(repository.update(saved)).rejects.toBeInstanceOf(ElectionNotFoundError);
    });
  });

  describe('findAll', () => {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * 86_400_000);
    const timeAt = (hh: number, mm = 0, ss = 0): Date => new Date(Date.UTC(1970, 0, 1, hh, mm, ss));

    async function seedElection(
      name: string,
      over: Partial<{
        startDate: Date;
        startTime: Date;
        endDate: Date;
        endTime: Date;
        description: string;
        blankVoteEnabled: boolean;
      }> = {},
    ): Promise<ElectionEntity> {
      usedNames.push(name);
      return repository.create(
        ElectionEntity.create({
          name,
          description: 'findAll integration test election.',
          startDate: addDays(today, -1),
          startTime: timeAt(0, 0, 0),
          endDate: addDays(today, 1),
          endTime: timeAt(23, 59, 59),
          ...over,
        }),
      );
    }

    it('returns all seeded elections when no filters are provided, with a total count', async () => {
      const names = [`ALL-A-${suffix}`, `ALL-B-${suffix}`, `ALL-C-${suffix}`];
      for (const name of names) await seedElection(name);

      const result = await repository.findAll({ page: 1, limit: 100 });

      const returnedNames = result.elections.map((e) => e.name);
      for (const name of names) expect(returnedNames).toContain(name);
      expect(result.total).toBeGreaterThanOrEqual(names.length);
    });

    it('orders results by created_at desc (deterministic with explicit timestamps)', async () => {
      const names = [`ORDER-${suffix}-1`, `ORDER-${suffix}-2`, `ORDER-${suffix}-3`];
      for (const name of names) await seedElection(name);

      const base = Date.UTC(2026, 7, 20, 12, 0, 0);
      for (const [index, name] of names.entries()) {
        await prisma.election.update({
          where: { name },
          data: { created_at: new Date(base + index * 1000) },
        });
      }

      const result = await repository.findAll({ page: 1, limit: 100, name: `ORDER-${suffix}` });
      expect(result.elections.map((e) => e.name)).toEqual([
        `ORDER-${suffix}-3`,
        `ORDER-${suffix}-2`,
        `ORDER-${suffix}-1`,
      ]);
    });

    it('paginates with page/limit slicing and reports the total count', async () => {
      for (let i = 0; i < 5; i += 1) {
        await seedElection(`PAGE-${suffix}-${i}`);
      }

      const page1 = await repository.findAll({ page: 1, limit: 2, name: `PAGE-${suffix}` });
      expect(page1.elections).toHaveLength(2);
      expect(page1.total).toBe(5);

      const page3 = await repository.findAll({ page: 3, limit: 2, name: `PAGE-${suffix}` });
      expect(page3.elections).toHaveLength(1);
      expect(page3.total).toBe(5);

      const page4 = await repository.findAll({ page: 4, limit: 2, name: `PAGE-${suffix}` });
      expect(page4.elections).toHaveLength(0);
      expect(page4.total).toBe(5);
    });

    it('filters by a partial, case-insensitive name and ignores whitespace-only names', async () => {
      await seedElection(`Student Council A ${suffix}`);
      await seedElection(`student council B ${suffix}`);
      await seedElection(`Other ${suffix}`);

      const matches = await repository.findAll({ page: 1, limit: 10, name: 'COUNCIL' });
      expect(matches.elections.map((e) => e.name).sort()).toEqual([
        `Student Council A ${suffix}`,
        `student council B ${suffix}`,
      ]);
      expect(matches.total).toBe(2);

      const lower = await repository.findAll({ page: 1, limit: 10, name: 'council' });
      expect(lower.total).toBe(2);

      const whitespace = await repository.findAll({ page: 1, limit: 10, name: '   ' });
      expect(whitespace.total).toBeGreaterThanOrEqual(3);
      const whitespaceNames = whitespace.elections.map((e) => e.name);
      for (const name of [`Student Council A ${suffix}`, `Other ${suffix}`]) {
        expect(whitespaceNames).toContain(name);
      }
    });

    it('filters by lifecycle status', async () => {
      await seedElection(`STATUS-${suffix}-A`);
      const pending = await seedElection(`STATUS-${suffix}-B`);
      await prisma.election.update({
        where: { id: pending.id as string },
        data: { current_status: 'PENDING' },
      });

      const result = await repository.findAll({
        page: 1,
        limit: 10,
        name: `STATUS-${suffix}`,
        status: 'PENDING',
      });

      expect(result.elections.map((e) => e.name)).toEqual([`STATUS-${suffix}-B`]);
      expect(result.total).toBe(1);
    });

    it('filters by startDate (start_date >= startDate)', async () => {
      await seedElection(`START-${suffix}-Y`, {
        startDate: addDays(today, -1),
        endDate: addDays(today, 60),
      });
      await seedElection(`START-${suffix}-T`, {
        startDate: today,
        endDate: addDays(today, 60),
      });
      await seedElection(`START-${suffix}-F`, {
        startDate: addDays(today, 30),
        endDate: addDays(today, 60),
      });

      const result = await repository.findAll({
        page: 1,
        limit: 10,
        name: `START-${suffix}`,
        startDate: today,
      });

      expect(result.elections.map((e) => e.name).sort()).toEqual([
        `START-${suffix}-F`,
        `START-${suffix}-T`,
      ]);
      expect(result.total).toBe(2);
    });

    it('filters by endDate (end_date <= endDate)', async () => {
      await seedElection(`END-${suffix}-Y`, {
        startDate: addDays(today, -30),
        endDate: addDays(today, -1),
      });
      await seedElection(`END-${suffix}-T`, {
        startDate: addDays(today, -30),
        endDate: today,
      });
      await seedElection(`END-${suffix}-F`, {
        startDate: addDays(today, -30),
        endDate: addDays(today, 30),
      });

      const result = await repository.findAll({
        page: 1,
        limit: 10,
        name: `END-${suffix}`,
        endDate: today,
      });

      expect(result.elections.map((e) => e.name).sort()).toEqual([
        `END-${suffix}-T`,
        `END-${suffix}-Y`,
      ]);
      expect(result.total).toBe(2);
    });

    it('filters active=true to the schedule-active window (wide date margins)', async () => {
      await seedElection(`WIN-${suffix}-A`, {
        startDate: addDays(today, -1),
        startTime: timeAt(0, 0, 0),
        endDate: addDays(today, 1),
        endTime: timeAt(23, 59, 59),
      });
      await seedElection(`WIN-${suffix}-B`, {
        startDate: today,
        startTime: timeAt(0, 0, 0),
        endDate: today,
        endTime: timeAt(23, 59, 59),
      });
      await seedElection(`WIN-${suffix}-C`, {
        startDate: addDays(today, -2),
        endDate: addDays(today, -1),
        endTime: timeAt(0, 0, 0),
      });
      await seedElection(`WIN-${suffix}-D`, {
        startDate: addDays(today, 1),
        endDate: addDays(today, 2),
      });

      const result = await repository.findAll({
        page: 1,
        limit: 10,
        name: `WIN-${suffix}`,
        active: true,
      });

      expect(result.elections.map((e) => e.name).sort()).toEqual([
        `WIN-${suffix}-A`,
        `WIN-${suffix}-B`,
      ]);
      expect(result.total).toBe(2);
    });

    it('filters active=false to the complement of the schedule-active window', async () => {
      await seedElection(`WINF-${suffix}-A`, {
        startDate: addDays(today, -1),
        startTime: timeAt(0, 0, 0),
        endDate: addDays(today, 1),
        endTime: timeAt(23, 59, 59),
      });
      await seedElection(`WINF-${suffix}-C`, {
        startDate: addDays(today, -2),
        endDate: addDays(today, -1),
        endTime: timeAt(0, 0, 0),
      });
      await seedElection(`WINF-${suffix}-D`, {
        startDate: addDays(today, 1),
        endDate: addDays(today, 2),
      });

      const result = await repository.findAll({
        page: 1,
        limit: 10,
        name: `WINF-${suffix}`,
        active: false,
      });

      expect(result.elections.map((e) => e.name).sort()).toEqual([
        `WINF-${suffix}-C`,
        `WINF-${suffix}-D`,
      ]);
      expect(result.total).toBe(2);
    });

    describe('active-window boundaries (injected reference instant)', () => {
      // Fixed "now" so the exact-boundary branches (start/end equal to today's date
      // at a specific time) can be exercised deterministically instead of only via
      // wide margins. 2026-09-15T12:30:00Z.
      const refNow = new Date(Date.UTC(2026, 8, 15, 12, 30, 0));
      const refDate = new Date(Date.UTC(2026, 8, 15));
      const refTime = new Date(Date.UTC(1970, 0, 1, 12, 30, 0));

      it('includes elections starting exactly at or just before the reference instant, excludes one starting one second later', async () => {
        await seedElection(`BD-START-${suffix}-NOW`, {
          startDate: refDate,
          startTime: refTime,
          endDate: addDays(refDate, 1),
          endTime: timeAt(23, 59, 59),
        });
        await seedElection(`BD-START-${suffix}-PREV`, {
          startDate: refDate,
          startTime: timeAt(12, 29, 59),
          endDate: addDays(refDate, 1),
          endTime: timeAt(23, 59, 59),
        });
        await seedElection(`BD-START-${suffix}-NEXT`, {
          startDate: refDate,
          startTime: timeAt(12, 30, 1),
          endDate: addDays(refDate, 1),
          endTime: timeAt(23, 59, 59),
        });

        const result = await repository.findAll({
          page: 1,
          limit: 10,
          name: `BD-START-${suffix}`,
          active: true,
          now: refNow,
        });

        expect(result.elections.map((e) => e.name).sort()).toEqual([
          `BD-START-${suffix}-NOW`,
          `BD-START-${suffix}-PREV`,
        ]);
        expect(result.total).toBe(2);
      });

      it('includes elections ending exactly at or after the reference instant, excludes one ending one second earlier', async () => {
        await seedElection(`BD-END-${suffix}-NOW`, {
          startDate: addDays(refDate, -1),
          startTime: timeAt(0, 0, 0),
          endDate: refDate,
          endTime: refTime,
        });
        await seedElection(`BD-END-${suffix}-PLUS`, {
          startDate: addDays(refDate, -1),
          startTime: timeAt(0, 0, 0),
          endDate: refDate,
          endTime: timeAt(12, 30, 1),
        });
        await seedElection(`BD-END-${suffix}-MINUS`, {
          startDate: addDays(refDate, -1),
          startTime: timeAt(0, 0, 0),
          endDate: refDate,
          endTime: timeAt(12, 29, 59),
        });

        const result = await repository.findAll({
          page: 1,
          limit: 10,
          name: `BD-END-${suffix}`,
          active: true,
          now: refNow,
        });

        expect(result.elections.map((e) => e.name).sort()).toEqual([
          `BD-END-${suffix}-NOW`,
          `BD-END-${suffix}-PLUS`,
        ]);
        expect(result.total).toBe(2);
      });

      it('active=false returns the complement of the boundary window', async () => {
        await seedElection(`BD-NOT-${suffix}-ACTIVE`, {
          startDate: refDate,
          startTime: refTime,
          endDate: addDays(refDate, 1),
          endTime: timeAt(23, 59, 59),
        });
        await seedElection(`BD-NOT-${suffix}-NOT-STARTED`, {
          startDate: refDate,
          startTime: timeAt(12, 30, 1),
          endDate: addDays(refDate, 1),
          endTime: timeAt(23, 59, 59),
        });
        await seedElection(`BD-NOT-${suffix}-ENDED`, {
          startDate: addDays(refDate, -1),
          startTime: timeAt(0, 0, 0),
          endDate: refDate,
          endTime: timeAt(12, 29, 59),
        });

        const result = await repository.findAll({
          page: 1,
          limit: 10,
          name: `BD-NOT-${suffix}`,
          active: false,
          now: refNow,
        });

        expect(result.elections.map((e) => e.name).sort()).toEqual([
          `BD-NOT-${suffix}-ENDED`,
          `BD-NOT-${suffix}-NOT-STARTED`,
        ]);
        expect(result.total).toBe(2);
      });
    });

    it('combines name, status and active filters into the exact intersection', async () => {
      const active = await seedElection(`COMB-${suffix}-OK`);
      await prisma.election.update({
        where: { id: active.id as string },
        data: { current_status: 'PENDING' },
      });
      await seedElection(`COMB-${suffix}-WRONG-STATUS`);
      const notActive = await seedElection(`COMB-${suffix}-NOT-ACTIVE`, {
        startDate: addDays(today, 1),
        endDate: addDays(today, 2),
      });
      await prisma.election.update({
        where: { id: notActive.id as string },
        data: { current_status: 'PENDING' },
      });

      const result = await repository.findAll({
        page: 1,
        limit: 10,
        name: `COMB-${suffix}`,
        status: 'PENDING',
        active: true,
      });

      expect(result.elections.map((e) => e.name)).toEqual([`COMB-${suffix}-OK`]);
      expect(result.total).toBe(1);
    });

    it('combines active with a lifecycle status', async () => {
      const pendingActive = await seedElection(`AST-${suffix}-P-OK`);
      await prisma.election.update({
        where: { id: pendingActive.id as string },
        data: { current_status: 'PENDING' },
      });
      const pendingPast = await seedElection(`AST-${suffix}-P-PAST`, {
        startDate: addDays(today, -2),
        endDate: addDays(today, -1),
        endTime: timeAt(0, 0, 0),
      });
      await prisma.election.update({
        where: { id: pendingPast.id as string },
        data: { current_status: 'PENDING' },
      });

      const result = await repository.findAll({
        page: 1,
        limit: 10,
        name: `AST-${suffix}`,
        status: 'PENDING',
        active: true,
      });

      expect(result.elections.map((e) => e.name)).toEqual([`AST-${suffix}-P-OK`]);
      expect(result.total).toBe(1);
    });

    it('returns an empty result when no election matches', async () => {
      const result = await repository.findAll({ page: 1, limit: 10, name: `NO-MATCH-${suffix}` });

      expect(result.elections).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('hasCandidates / hasVotes / delete', () => {
    const seededCandidateIds: string[] = [];
    const seededVoteIds: string[] = [];
    const seededElectorIds: string[] = [];

    afterEach(async () => {
      await prisma.voteMetadata.deleteMany({ where: { id: { in: seededVoteIds } } });
      await prisma.candiday.deleteMany({
        where: { candidate_id: { in: seededCandidateIds } },
      });
      await prisma.candidate.deleteMany({ where: { id: { in: seededCandidateIds } } });
      await prisma.electoralRoll.deleteMany({ where: { elector_id: { in: seededElectorIds } } });
      await prisma.elector.deleteMany({ where: { id: { in: seededElectorIds } } });
      seededCandidateIds.length = 0;
      seededVoteIds.length = 0;
      seededElectorIds.length = 0;
    });

    async function seedCandidacy(electionId: string): Promise<void> {
      const candidate = await prisma.candidate.create({
        data: {
          first_name: 'Test',
          last_name: 'Candidate',
          student_code: `SC-${Date.now()}-${Math.random()}`,
          program_code: 'PC',
          identification_number: `ID-${Date.now()}-${Math.random()}`,
          status: 'ACTIVE',
        },
      });
      seededCandidateIds.push(candidate.id);
      await prisma.candiday.create({
        data: { candidate_id: candidate.id, election_id: electionId, position_number: 1 },
      });
    }

    async function seedVote(electionId: string): Promise<void> {
      const vote = await prisma.voteMetadata.create({
        data: { election_id: electionId, tx_hash: `0x${Date.now()}-${Math.random()}` },
      });
      seededVoteIds.push(vote.id);
    }

    it('hasCandidates returns false for an empty election and true after a candidacy is added', async () => {
      const name = `HASCAND-${suffix}`;
      usedNames.push(name);
      const saved = await repository.create(buildEntity(name));
      const id = saved.id as string;

      expect(await repository.hasCandidates(id)).toBe(false);

      await seedCandidacy(id);
      expect(await repository.hasCandidates(id)).toBe(true);
    });

    it('hasVotes returns false for an empty election and true after a vote is added', async () => {
      const name = `HASVOTE-${suffix}`;
      usedNames.push(name);
      const saved = await repository.create(buildEntity(name));
      const id = saved.id as string;

      expect(await repository.hasVotes(id)).toBe(false);

      await seedVote(id);
      expect(await repository.hasVotes(id)).toBe(true);
    });

    it('delete removes a CREATED election with no related rows', async () => {
      const name = `DEL-${suffix}`;
      usedNames.push(name);
      const saved = await repository.create(buildEntity(name));
      const id = saved.id as string;

      await repository.delete(id);

      expect(await prisma.election.findUnique({ where: { id } })).toBeNull();
    });

    it('delete removes the election and related electoral rolls without orphans', async () => {
      const name = `DELCHILD-${suffix}`;
      usedNames.push(name);
      const saved = await repository.create(buildEntity(name));
      const id = saved.id as string;

      const elector = await prisma.elector.create({
        data: {
          first_name: 'Test',
          last_name: 'Elector',
          email: `e2e-${suffix}-${Math.random()}@example.com`,
          password_hash: 'hash',
          student_code: `ELE-${Date.now()}-${Math.random()}`,
          program_code: 'PC',
          status: 'ACTIVE',
        },
      });
      seededElectorIds.push(elector.id);
      await prisma.electoralRoll.create({
        data: { election_id: id, elector_id: elector.id },
      });

      await repository.delete(id);

      expect(await prisma.election.findUnique({ where: { id } })).toBeNull();
      expect(await prisma.electoralRoll.findMany({ where: { election_id: id } })).toHaveLength(0);
      // The elector itself is preserved (no cleanup of unrelated entities).
      expect(await prisma.elector.findUnique({ where: { id: elector.id } })).not.toBeNull();
    });

    it('delete throws ElectionNotFoundError when the election does not exist', async () => {
      await expect(
        repository.delete('00000000-0000-0000-0000-000000000000'),
      ).rejects.toBeInstanceOf(ElectionNotFoundError);
    });
  });
});
