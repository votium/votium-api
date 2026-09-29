import { PrismaService } from '../../src/shared/database/prisma.service';
import { PrismaResultRepository } from '../../src/modules/voting/infrastructure/repositories/prisma-result.repository';

describe('PrismaResultRepository integration', () => {
  let prisma: PrismaService;
  let repository: PrismaResultRepository;

  const suffix = Date.now();
  const usedElectionIds: string[] = [];
  const usedCandidateIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaResultRepository(prisma);
  });

  afterEach(async () => {
    if (usedElectionIds.length > 0) {
      await prisma.result.deleteMany({ where: { election_id: { in: usedElectionIds } } });
      await prisma.candiday.deleteMany({ where: { election_id: { in: usedElectionIds } } });
      await prisma.election.deleteMany({ where: { id: { in: usedElectionIds } } });
      usedElectionIds.length = 0;
    }
    if (usedCandidateIds.length > 0) {
      await prisma.candidate.deleteMany({ where: { id: { in: usedCandidateIds } } });
      usedCandidateIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedElection(): Promise<string> {
    const created = await prisma.election.create({
      data: {
        name: `RES-INT-${suffix}-${Math.random()}`,
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

  async function seedCandidate(): Promise<string> {
    const created = await prisma.candidate.create({
      data: {
        first_name: 'Test',
        last_name: 'Candidate',
        student_code: `RES-SC-${suffix}-${Math.random()}`,
        program_code: '1234',
        identification_number: `RES-ID-${suffix}-${Math.random()}`,
        status: 'ACTIVE',
      },
    });
    usedCandidateIds.push(created.id);
    return created.id;
  }

  async function seedCandidacy(electionId: string): Promise<string> {
    const candidateId = await seedCandidate();
    const created = await prisma.candiday.create({
      data: {
        election_id: electionId,
        candidate_id: candidateId,
        position_number: 1,
      },
    });
    return created.id;
  }

  describe('incrementVotes', () => {
    it('IR-01: creates a row with votes = 1 when none exists', async () => {
      const electionId = await seedElection();
      const candidacyId = await seedCandidacy(electionId);

      await repository.incrementVotes(electionId, candidacyId);

      const row = await prisma.result.findUnique({
        where: { election_id_candidacy_id: { election_id: electionId, candidacy_id: candidacyId } },
      });
      expect(row).not.toBeNull();
      expect(row!.votes).toBe(1);
      expect(row!.updated_at).toBeInstanceOf(Date);
    });

    it('IR-02: increments an existing row by one', async () => {
      const electionId = await seedElection();
      const candidacyId = await seedCandidacy(electionId);

      await repository.incrementVotes(electionId, candidacyId);
      await repository.incrementVotes(electionId, candidacyId);

      const row = await prisma.result.findUnique({
        where: { election_id_candidacy_id: { election_id: electionId, candidacy_id: candidacyId } },
      });
      expect(row!.votes).toBe(2);
    });

    it('IR-03: updates updated_at on every increment', async () => {
      const electionId = await seedElection();
      const candidacyId = await seedCandidacy(electionId);

      await repository.incrementVotes(electionId, candidacyId);
      const first = await prisma.result.findUnique({
        where: { election_id_candidacy_id: { election_id: electionId, candidacy_id: candidacyId } },
      });

      await new Promise((resolve) => setTimeout(resolve, 20));
      await repository.incrementVotes(electionId, candidacyId);
      const second = await prisma.result.findUnique({
        where: { election_id_candidacy_id: { election_id: electionId, candidacy_id: candidacyId } },
      });

      expect(second!.updated_at.getTime()).toBeGreaterThan(first!.updated_at.getTime());
    });
  });
});
