import { randomUUID } from 'crypto';
import { PrismaElectionResultRepository } from '../../src/modules/elections/infrastructure/repositories/prisma-election-result.repository';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { nextTestElectionCode } from './election-code.utils';

describe('PrismaElectionResultRepository (integration)', () => {
  let prisma: PrismaService;
  let repository: PrismaElectionResultRepository;

  const suffix = Date.now();
  const electionIds: string[] = [];
  const candidateIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaElectionResultRepository(prisma);
  });

  afterEach(async () => {
    if (electionIds.length > 0) {
      await prisma.result.deleteMany({ where: { election_id: { in: electionIds } } });
      await prisma.candiday.deleteMany({ where: { election_id: { in: electionIds } } });
      await prisma.election.deleteMany({ where: { id: { in: electionIds } } });
      electionIds.length = 0;
    }
    if (candidateIds.length > 0) {
      await prisma.candidate.deleteMany({ where: { id: { in: candidateIds } } });
      candidateIds.length = 0;
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedElection(): Promise<string> {
    const row = await prisma.election.create({
      data: {
        electionCode: await nextTestElectionCode(prisma),
        name: `RESULTS-REPO-${suffix}-${Math.random()}`,
        description: 'Results repository integration.',
        start_date: new Date(Date.UTC(2026, 9, 1)),
        start_time: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        end_date: new Date(Date.UTC(2026, 9, 1)),
        end_time: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
        current_status: 'PUBLISHED',
        blank_vote_enabled: false,
      },
    });
    electionIds.push(row.id);
    return row.id;
  }

  async function seedCandidacy(
    electionId: string,
    position: number,
    status: 'ACTIVE' | 'INACTIVE' = 'ACTIVE',
  ): Promise<{ id: string; candidateId: string }> {
    const candidate = await prisma.candidate.create({
      data: {
        first_name: 'Result',
        last_name: `Candidate ${position}`,
        student_code: `RES-${suffix}-${Math.random()}`,
        program_code: '1234',
        identification_number: `RESI-${suffix}-${Math.random()}`,
        status,
      },
    });
    candidateIds.push(candidate.id);
    const candidacy = await prisma.candiday.create({
      data: { election_id: electionId, candidate_id: candidate.id, position_number: position },
    });
    return { id: candidacy.id, candidateId: candidate.id };
  }

  const votesOf = async (electionId: string) =>
    (
      await prisma.result.findMany({
        where: { election_id: electionId },
        select: { candidacy_id: true, votes: true },
        orderBy: { candidacy_id: 'asc' },
      })
    ).map((row) => ({ candidacyId: row.candidacy_id, votes: row.votes }));

  it('RR-01: findCandidacyRefsByElection returns every candidacy, including INACTIVE candidates', async () => {
    const electionId = await seedElection();
    const second = await seedCandidacy(electionId, 2, 'INACTIVE');
    const first = await seedCandidacy(electionId, 1);

    await expect(repository.findCandidacyRefsByElection(electionId)).resolves.toEqual([
      { id: first.id, candidateId: first.candidateId },
      { id: second.id, candidateId: second.candidateId },
    ]);
  });

  it('RR-02: synchronize inserts new rows and returns the number of rows', async () => {
    const electionId = await seedElection();
    const a = await seedCandidacy(electionId, 1);
    const b = await seedCandidacy(electionId, 2);

    const written = await repository.synchronize(electionId, [
      { candidacyId: a.id, votes: 4 },
      { candidacyId: b.id, votes: 0 },
    ]);

    expect(written).toBe(2);
    expect(await votesOf(electionId)).toEqual(
      [
        { candidacyId: a.id, votes: 4 },
        { candidacyId: b.id, votes: 0 },
      ].sort((x, y) => x.candidacyId.localeCompare(y.candidacyId)),
    );
  });

  it('RR-03: synchronize overwrites votes and updated_at of existing rows (no accumulation)', async () => {
    const electionId = await seedElection();
    const a = await seedCandidacy(electionId, 1);
    const old = new Date('2026-01-01T00:00:00.000Z');
    await prisma.result.create({
      data: { election_id: electionId, candidacy_id: a.id, votes: 99, updated_at: old },
    });

    await repository.synchronize(electionId, [{ candidacyId: a.id, votes: 3 }]);

    const row = await prisma.result.findUniqueOrThrow({
      where: { election_id_candidacy_id: { election_id: electionId, candidacy_id: a.id } },
    });
    expect(row.votes).toBe(3);
    expect(row.updated_at.getTime()).toBeGreaterThan(old.getTime());
  });

  it('RR-04: synchronize zeroes rows of the election not included, without deleting them', async () => {
    const electionId = await seedElection();
    const a = await seedCandidacy(electionId, 1);
    const stale = await seedCandidacy(electionId, 2);
    await prisma.result.create({
      data: { election_id: electionId, candidacy_id: stale.id, votes: 8 },
    });
    const staleRow = await prisma.result.findUniqueOrThrow({
      where: { election_id_candidacy_id: { election_id: electionId, candidacy_id: stale.id } },
    });

    await repository.synchronize(electionId, [{ candidacyId: a.id, votes: 2 }]);

    const after = await prisma.result.findUniqueOrThrow({ where: { id: staleRow.id } });
    expect(after.votes).toBe(0);
  });

  it('RR-05: running synchronize twice is idempotent (same counts, no duplicates)', async () => {
    const electionId = await seedElection();
    const a = await seedCandidacy(electionId, 1);
    const b = await seedCandidacy(electionId, 2);
    const rows = [
      { candidacyId: a.id, votes: 5 },
      { candidacyId: b.id, votes: 1 },
    ];

    await repository.synchronize(electionId, rows);
    const first = await votesOf(electionId);
    await repository.synchronize(electionId, rows);

    expect(await votesOf(electionId)).toEqual(first);
    await expect(prisma.result.count({ where: { election_id: electionId } })).resolves.toBe(2);
  });

  it('RR-06: a failing row rolls back the whole transaction (no partial writes)', async () => {
    const electionId = await seedElection();
    const a = await seedCandidacy(electionId, 1);
    await prisma.result.create({ data: { election_id: electionId, candidacy_id: a.id, votes: 1 } });

    await expect(
      repository.synchronize(electionId, [
        { candidacyId: a.id, votes: 50 },
        { candidacyId: randomUUID(), votes: 2 },
      ]),
    ).rejects.toBeDefined();

    expect(await votesOf(electionId)).toEqual([{ candidacyId: a.id, votes: 1 }]);
  });
});
