import { PrismaService } from '../../src/shared/database/prisma.service';
import { CandidacyEntity } from '../../src/modules/candidacies/domain/entities/candidacy.entity';
import { CandidacyDuplicateError } from '../../src/modules/candidacies/domain/errors/candidacy-duplicate.error';
import { PrismaCandidacyRepository } from '../../src/modules/candidacies/infrastructure/repositories/prisma-candidacy.repository';

describe('PrismaCandidacyRepository integration', () => {
  let prisma: PrismaService;
  let repository: PrismaCandidacyRepository;

  const suffix = Date.now();
  const createdElectionIds: string[] = [];
  const createdCandidateIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaCandidacyRepository(prisma);
  });

  afterEach(async () => {
    await prisma.candiday.deleteMany({
      where: { election_id: { in: createdElectionIds } },
    });
  });

  afterAll(async () => {
    await prisma.candiday.deleteMany({
      where: { election_id: { in: createdElectionIds } },
    });
    await prisma.candidate.deleteMany({ where: { id: { in: createdCandidateIds } } });
    await prisma.election.deleteMany({ where: { id: { in: createdElectionIds } } });
    await prisma.$disconnect();
  });

  async function seedElection(): Promise<string> {
    const row = await prisma.election.create({
      data: {
        name: `INT-CAND-${suffix}-${Math.random()}`,
        description: 'Integration test election.',
        start_date: new Date(Date.UTC(2026, 9, 1)),
        start_time: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        end_date: new Date(Date.UTC(2026, 9, 1)),
        end_time: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
        current_status: 'PENDING',
        blank_vote_enabled: false,
      },
    });
    createdElectionIds.push(row.id);
    return row.id;
  }

  async function seedCandidate(): Promise<string> {
    const row = await prisma.candidate.create({
      data: {
        first_name: 'INT',
        last_name: 'Candidate',
        student_code: `SC-${suffix}-${Math.random()}`,
        program_code: '1234',
        identification_number: `ID-${suffix}-${Math.random()}`,
        status: 'ACTIVE',
      },
    });
    createdCandidateIds.push(row.id);
    return row.id;
  }

  function buildEntity(
    electionId: string,
    candidateId: string,
    positionNumber: number,
  ): CandidacyEntity {
    return CandidacyEntity.create({ electionId, candidateId, positionNumber });
  }

  it('I-01: persists a candidacy and returns a Prisma-generated id and createdAt', async () => {
    const electionId = await seedElection();
    const candidateId = await seedCandidate();
    const entity = buildEntity(electionId, candidateId, 1);

    const saved = await repository.create(entity);

    expect(saved.id).toBeTruthy();
    expect(saved.id).not.toBeNull();
    expect(saved.createdAt).toBeInstanceOf(Date);
    expect(saved.electionId).toBe(electionId);
    expect(saved.candidateId).toBe(candidateId);
    expect(saved.positionNumber).toBe(1);
    expect(saved.imageUrl).toBeNull();

    const row = await prisma.candiday.findUnique({ where: { id: saved.id as string } });
    expect(row).not.toBeNull();
    expect(row!.position_number).toBe(1);
    expect(row!.image_url).toBeNull();
  });

  it('I-02: rejects a duplicate (candidate_id, election_id) pair with CandidacyDuplicateError', async () => {
    const electionId = await seedElection();
    const candidateId = await seedCandidate();
    await repository.create(buildEntity(electionId, candidateId, 1));

    await expect(repository.create(buildEntity(electionId, candidateId, 2))).rejects.toBeInstanceOf(
      CandidacyDuplicateError,
    );

    const rows = await prisma.candiday.findMany({ where: { election_id: electionId } });
    expect(rows).toHaveLength(1);
  });

  it('I-03: rejects a duplicate (position_number, election_id) pair with CandidacyDuplicateError', async () => {
    const electionId = await seedElection();
    const candidateA = await seedCandidate();
    const candidateB = await seedCandidate();
    await repository.create(buildEntity(electionId, candidateA, 3));

    await expect(repository.create(buildEntity(electionId, candidateB, 3))).rejects.toBeInstanceOf(
      CandidacyDuplicateError,
    );

    const rows = await prisma.candiday.findMany({ where: { election_id: electionId } });
    expect(rows).toHaveLength(1);
  });

  it('I-04: findMaxPosition returns 0 for an election with no candidacies', async () => {
    const electionId = await seedElection();

    const max = await repository.findMaxPosition(electionId);

    expect(max).toBe(0);
  });

  it('I-05: findMaxPosition returns the maximum position_number when rows exist', async () => {
    const electionId = await seedElection();
    const candidateA = await seedCandidate();
    const candidateB = await seedCandidate();
    await repository.create(buildEntity(electionId, candidateA, 1));
    await repository.create(buildEntity(electionId, candidateB, 3));

    const max = await repository.findMaxPosition(electionId);

    expect(max).toBe(3);
  });

  it('I-06: findMaxPosition is scoped per election', async () => {
    const electionA = await seedElection();
    const electionB = await seedElection();
    const candidateA = await seedCandidate();
    const candidateB = await seedCandidate();
    await repository.create(buildEntity(electionA, candidateA, 5));
    await repository.create(buildEntity(electionB, candidateB, 2));

    expect(await repository.findMaxPosition(electionA)).toBe(5);
    expect(await repository.findMaxPosition(electionB)).toBe(2);
  });
});
