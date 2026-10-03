import { PrismaService } from '../../src/shared/database/prisma.service';
import { PrismaElectoralRollRepository } from '../../src/modules/electoral-rolls/infrastructure/repositories/prisma-electoral-roll.repository';

describe('PrismaElectoralRollRepository integration', () => {
  let prisma: PrismaService;
  let repository: PrismaElectoralRollRepository;

  const suffix = Date.now();
  const usedElectionIds: string[] = [];
  const usedStudentCodes: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaElectoralRollRepository(prisma);
  });

  afterEach(async () => {
    if (usedElectionIds.length > 0) {
      await prisma.electoralRoll.deleteMany({ where: { election_id: { in: usedElectionIds } } });
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
        name: `ROLL-INT-${suffix}-${Math.random()}`,
        description: 'Integration test election.',
        start_date: new Date(Date.UTC(2026, 9, 1)),
        start_time: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        end_date: new Date(Date.UTC(2026, 9, 1)),
        end_time: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
      },
    });
    usedElectionIds.push(created.id);
    return created.id;
  }

  async function seedElector(studentCode?: string): Promise<string> {
    const code = studentCode ?? `ROLL-EL-${suffix}-${usedStudentCodes.length}`;
    const created = await prisma.elector.create({
      data: {
        first_name: 'Test',
        last_name: 'Elector',
        email: `roll-int-${suffix}-${Math.random()}@example.com`,
        password_hash: 'pbkdf2$placeholder',
        student_code: code,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    usedStudentCodes.push(code);
    return created.id;
  }

  describe('createMany', () => {
    it('I1: inserts rolls and returns the correct count', async () => {
      const electionId = await seedElection();
      const electorId = await seedElector();

      const count = await repository.createMany(electionId, [electorId]);

      expect(count).toBe(1);

      const rows = await prisma.electoralRoll.findMany({ where: { election_id: electionId } });
      expect(rows).toHaveLength(1);
      expect(rows[0].elector_id).toBe(electorId);
    });

    it('I2: handles the unique constraint with skipDuplicates on a repeat insert', async () => {
      const electionId = await seedElection();
      const electorId = await seedElector();

      await repository.createMany(electionId, [electorId]);
      const again = await repository.createMany(electionId, [electorId]);

      expect(again).toBe(0);
      const rows = await prisma.electoralRoll.findMany({ where: { election_id: electionId } });
      expect(rows).toHaveLength(1);
    });

    it('I3: returns 0 for an empty electorIds list', async () => {
      const electionId = await seedElection();

      const count = await repository.createMany(electionId, []);

      expect(count).toBe(0);
    });
  });

  describe('findByElectionAndElectorIds', () => {
    it('I4: returns the matching rolls', async () => {
      const electionId = await seedElection();
      const electorId = await seedElector();
      await repository.createMany(electionId, [electorId]);

      const rolls = await repository.findByElectionAndElectorIds(electionId, [electorId]);

      expect(rolls).toHaveLength(1);
      expect(rolls[0].electionId).toBe(electionId);
      expect(rolls[0].electorId).toBe(electorId);
    });

    it('I5: returns an empty list when no roll matches the elector ids', async () => {
      const electionId = await seedElection();
      const electorId = await seedElector();

      const rolls = await repository.findByElectionAndElectorIds(electionId, [electorId]);

      expect(rolls).toHaveLength(0);
    });

    it('I6: ignores rolls from other elections', async () => {
      const electionA = await seedElection();
      const electionB = await seedElection();
      const electorId = await seedElector();
      await repository.createMany(electionA, [electorId]);

      const rolls = await repository.findByElectionAndElectorIds(electionB, [electorId]);

      expect(rolls).toHaveLength(0);
    });

    it('I7: ignores rolls for other electors', async () => {
      const electionId = await seedElection();
      const electorA = await seedElector();
      const electorB = await seedElector();
      await repository.createMany(electionId, [electorA]);

      const rolls = await repository.findByElectionAndElectorIds(electionId, [electorB]);

      expect(rolls).toHaveLength(0);
    });
  });

  describe('countByElection', () => {
    it('I8: returns the correct total for an election with rolls', async () => {
      const electionId = await seedElection();
      const electorA = await seedElector();
      const electorB = await seedElector();
      await repository.createMany(electionId, [electorA, electorB]);

      const count = await repository.countByElection(electionId);

      expect(count).toBe(2);
    });

    it('I9: returns 0 for an election with no rolls', async () => {
      const electionId = await seedElection();

      const count = await repository.countByElection(electionId);

      expect(count).toBe(0);
    });
  });

  describe('deleteByElectionAndElectorId', () => {
    it('IR1: deletes only the targeted election–elector pair, leaving others untouched', async () => {
      const electionA = await seedElection();
      const electionB = await seedElection();
      const electorA = await seedElector();
      const electorB = await seedElector();
      await repository.createMany(electionA, [electorA, electorB]);
      await repository.createMany(electionB, [electorA]);

      const deleted = await repository.deleteByElectionAndElectorId(electionA, electorA);

      expect(deleted).toBe(true);
      expect(await repository.countByElection(electionA)).toBe(1);
      expect(await repository.countByElection(electionB)).toBe(1);
      const remainingA = await prisma.electoralRoll.findMany({
        where: { election_id: electionA },
      });
      expect(remainingA[0].elector_id).toBe(electorB);
    });

    it('IR2: returns true when a row is deleted', async () => {
      const electionId = await seedElection();
      const electorId = await seedElector();
      await repository.createMany(electionId, [electorId]);

      const deleted = await repository.deleteByElectionAndElectorId(electionId, electorId);

      expect(deleted).toBe(true);
    });

    it('IR3: returns false when no association exists', async () => {
      const electionId = await seedElection();
      const electorId = await seedElector();

      const deleted = await repository.deleteByElectionAndElectorId(electionId, electorId);

      expect(deleted).toBe(false);
    });

    it('IR4: leaves the elector row itself in the database', async () => {
      const electionId = await seedElection();
      const electorId = await seedElector();
      await repository.createMany(electionId, [electorId]);

      await repository.deleteByElectionAndElectorId(electionId, electorId);

      const elector = await prisma.elector.findUnique({ where: { id: electorId } });
      expect(elector).not.toBeNull();
    });

    it('IR5: is idempotent — a second call returns false', async () => {
      const electionId = await seedElection();
      const electorId = await seedElector();
      await repository.createMany(electionId, [electorId]);

      await expect(repository.deleteByElectionAndElectorId(electionId, electorId)).resolves.toBe(
        true,
      );
      await expect(repository.deleteByElectionAndElectorId(electionId, electorId)).resolves.toBe(
        false,
      );
    });
  });

  describe('persisted defaults', () => {
    it('I10: persists default values (hasVoted=false, voteAttempts=0)', async () => {
      const electionId = await seedElection();
      const electorId = await seedElector();
      await repository.createMany(electionId, [electorId]);

      const row = await prisma.electoralRoll.findFirst({ where: { election_id: electionId } });

      expect(row).not.toBeNull();
      expect(row!.has_voted).toBe(false);
      expect(row!.vote_attempts).toBe(0);
      expect(row!.last_vote_attempt).toBeNull();
    });

    it('I11: stores election_id and elector_id correctly', async () => {
      const electionId = await seedElection();
      const electorId = await seedElector();
      await repository.createMany(electionId, [electorId]);

      const row = await prisma.electoralRoll.findFirst({ where: { election_id: electionId } });

      expect(row!.election_id).toBe(electionId);
      expect(row!.elector_id).toBe(electorId);
    });
  });
});
