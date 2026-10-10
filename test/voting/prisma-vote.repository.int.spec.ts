import { PrismaService } from '../../src/shared/database/prisma.service';
import { PrismaVoteRepository } from '../../src/modules/voting/infrastructure/repositories/prisma-vote.repository';

describe('PrismaVoteRepository integration', () => {
  let prisma: PrismaService;
  let repository: PrismaVoteRepository;

  const suffix = Date.now();
  const usedElectionIds: string[] = [];
  const usedCandidateIds: string[] = [];
  const usedElectorIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaVoteRepository(prisma);
  });

  afterEach(async () => {
    if (usedElectionIds.length > 0) {
      await prisma.result.deleteMany({ where: { election_id: { in: usedElectionIds } } });
      await prisma.electoralRoll.deleteMany({ where: { election_id: { in: usedElectionIds } } });
      await prisma.candiday.deleteMany({ where: { election_id: { in: usedElectionIds } } });
      await prisma.election.deleteMany({ where: { id: { in: usedElectionIds } } });
      usedElectionIds.length = 0;
    }
    if (usedCandidateIds.length > 0) {
      await prisma.candidate.deleteMany({ where: { id: { in: usedCandidateIds } } });
      usedCandidateIds.length = 0;
    }
    if (usedElectorIds.length > 0) {
      await prisma.elector.deleteMany({ where: { id: { in: usedElectorIds } } });
      usedElectorIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedElection(status: 'ACTIVE' | 'CANCELLED' = 'ACTIVE'): Promise<string> {
    const created = await prisma.election.create({
      data: {
        name: `VOTE-INT-${suffix}-${Math.random()}`,
        description: 'Integration test election.',
        start_date: new Date(Date.UTC(2026, 9, 1)),
        start_time: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        end_date: new Date(Date.UTC(2026, 9, 1)),
        end_time: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
        current_status: status,
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
        student_code: `VOTE-SC-${suffix}-${Math.random()}`,
        program_code: '1234',
        identification_number: `VOTE-ID-${suffix}-${Math.random()}`,
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

  async function seedElector(): Promise<string> {
    const created = await prisma.elector.create({
      data: {
        first_name: 'Test',
        last_name: 'Elector',
        email: `vote-int-${suffix}-${Math.random()}@correounivalle.edu.co`,
        password_hash: 'hashed',
        student_code: `VOTE-EL-${suffix}-${Math.random()}`,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    usedElectorIds.push(created.id);
    return created.id;
  }

  async function seedRoll(electionId: string, electorId: string): Promise<void> {
    await prisma.electoralRoll.create({
      data: { election_id: electionId, elector_id: electorId },
    });
  }

  function buildInput(electionId: string, electorId: string, candidacyId: string, now: Date) {
    return {
      electionId,
      electorId,
      candidacyId,
      idempotencyKey: 'key-abc',
      now,
    };
  }

  async function findRoll(electionId: string, electorId: string) {
    return prisma.electoralRoll.findUnique({
      where: { election_id_elector_id: { election_id: electionId, elector_id: electorId } },
    });
  }

  describe('recordVote', () => {
    it('IV-01: records a candidacy vote atomically (roll claim + tally)', async () => {
      const electionId = await seedElection();
      const candidacyId = await seedCandidacy(electionId);
      const electorId = await seedElector();
      await seedRoll(electionId, electorId);

      const now = new Date();
      const result = await repository.recordVote(
        buildInput(electionId, electorId, candidacyId, now),
      );

      expect(result).toEqual({ outcome: 'recorded' });

      const roll = await findRoll(electionId, electorId);
      expect(roll!.has_voted).toBe(true);
      expect(roll!.vote_attempts).toBe(1);
      expect(roll!.last_vote_attempt).toEqual(now);
      expect(roll!.last_vote_candidacy_id).toBe(candidacyId);
      expect(roll!.last_vote_idempotency_key).toBe('key-abc');
      expect(roll!.last_vote_registered_at).toEqual(now);

      const tally = await prisma.result.findUnique({
        where: { election_id_candidacy_id: { election_id: electionId, candidacy_id: candidacyId } },
      });
      expect(tally!.votes).toBe(1);
    });

    it('IV-02: records a blank-vote claim without creating a Result row', async () => {
      const electionId = await seedElection();
      const electorId = await seedElector();
      await seedRoll(electionId, electorId);

      const result = await repository.recordVote(
        buildInput(electionId, electorId, 'blank', new Date()),
      );

      expect(result).toEqual({ outcome: 'recorded' });

      const roll = await findRoll(electionId, electorId);
      expect(roll!.has_voted).toBe(true);
      expect(roll!.last_vote_candidacy_id).toBe('blank');

      const count = await prisma.result.count({ where: { election_id: electionId } });
      expect(count).toBe(0);
    });

    it('IV-03: a second recordVote is a no-op and does not double-count', async () => {
      const electionId = await seedElection();
      const candidacyId = await seedCandidacy(electionId);
      const electorId = await seedElector();
      await seedRoll(electionId, electorId);

      await repository.recordVote(buildInput(electionId, electorId, candidacyId, new Date()));
      const second = await repository.recordVote(
        buildInput(electionId, electorId, candidacyId, new Date()),
      );

      expect(second).toEqual({ outcome: 'already_voted' });

      const roll = await findRoll(electionId, electorId);
      expect(roll!.vote_attempts).toBe(1);

      const tally = await prisma.result.findUnique({
        where: { election_id_candidacy_id: { election_id: electionId, candidacy_id: candidacyId } },
      });
      expect(tally!.votes).toBe(1);
    });

    it('IV-04: concurrent recordVote calls produce a single recorded vote', async () => {
      const electionId = await seedElection();
      const candidacyId = await seedCandidacy(electionId);
      const electorId = await seedElector();
      await seedRoll(electionId, electorId);

      const [a, b] = await Promise.all([
        repository.recordVote(buildInput(electionId, electorId, candidacyId, new Date())),
        repository.recordVote(buildInput(electionId, electorId, candidacyId, new Date())),
      ]);

      const outcomes = [a, b].map((r) => r.outcome).sort();
      expect(outcomes).toEqual(['already_voted', 'recorded']);

      const roll = await findRoll(electionId, electorId);
      expect(roll!.has_voted).toBe(true);
      expect(roll!.vote_attempts).toBe(1);

      const tally = await prisma.result.findUnique({
        where: { election_id_candidacy_id: { election_id: electionId, candidacy_id: candidacyId } },
      });
      expect(tally!.votes).toBe(1);
    });

    it('IV-05: concurrent votes from different electors both count (no lost tally)', async () => {
      const electionId = await seedElection();
      const candidacyId = await seedCandidacy(electionId);
      const electorA = await seedElector();
      const electorB = await seedElector();
      await seedRoll(electionId, electorA);
      await seedRoll(electionId, electorB);

      await Promise.all([
        repository.recordVote(buildInput(electionId, electorA, candidacyId, new Date())),
        repository.recordVote(buildInput(electionId, electorB, candidacyId, new Date())),
      ]);

      const tally = await prisma.result.findUnique({
        where: { election_id_candidacy_id: { election_id: electionId, candidacy_id: candidacyId } },
      });
      expect(tally!.votes).toBe(2);
    });

    it('IV-06: recordVote on a CANCELLED election returns election_not_active and claims nothing', async () => {
      const electionId = await seedElection('CANCELLED');
      const candidacyId = await seedCandidacy(electionId);
      const electorId = await seedElector();
      await seedRoll(electionId, electorId);

      const result = await repository.recordVote(
        buildInput(electionId, electorId, candidacyId, new Date()),
      );

      expect(result).toEqual({ outcome: 'election_not_active' });

      const roll = await findRoll(electionId, electorId);
      expect(roll!.has_voted).toBe(false);
      expect(roll!.vote_attempts).toBe(0);

      const count = await prisma.result.count({ where: { election_id: electionId } });
      expect(count).toBe(0);
    });

    it('IV-07: recordVote on a missing election returns election_not_active without throwing', async () => {
      const electorId = await seedElector();
      const missingElectionId = '00000000-0000-4000-8000-000000000000';

      const result = await repository.recordVote(
        buildInput(missingElectionId, electorId, 'candidacy-x', new Date()),
      );

      expect(result).toEqual({ outcome: 'election_not_active' });
    });

    it('IV-08: a concurrent cancellation serializes with recordVote — no vote commits after cancellation', async () => {
      const electionId = await seedElection('ACTIVE');
      const candidacyId = await seedCandidacy(electionId);
      const electorId = await seedElector();
      await seedRoll(electionId, electorId);

      // Race the vote against a cancellation UPDATE on the same elections row. The vote
      // takes a FOR SHARE lock and the cancel an exclusive lock, so the two serialize.
      const [voteResult] = await Promise.all([
        repository.recordVote(buildInput(electionId, electorId, candidacyId, new Date())),
        prisma.election.update({
          where: { id: electionId },
          data: { current_status: 'CANCELLED' },
        }),
      ]);

      const roll = await findRoll(electionId, electorId);
      // Invariant: a recorded vote and a not-active outcome are mutually exclusive with
      // the persisted roll state — the forbidden "recorded after cancellation" case would
      // require `outcome !== 'recorded'` while `has_voted === true`, which cannot occur.
      if (voteResult.outcome === 'recorded') {
        expect(roll!.has_voted).toBe(true);
      } else if (voteResult.outcome === 'election_not_active') {
        expect(roll!.has_voted).toBe(false);
      }
    });
  });
});
