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

  async function seedElection(name?: string): Promise<string> {
    const row = await prisma.election.create({
      data: {
        name: name ?? `INT-CAND-${suffix}-${Math.random()}`,
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

  async function seedCandidate(
    overrides: { firstName?: string; lastName?: string; status?: string } = {},
  ): Promise<string> {
    const row = await prisma.candidate.create({
      data: {
        first_name: overrides.firstName ?? 'INT',
        last_name: overrides.lastName ?? 'Candidate',
        student_code: `SC-${suffix}-${Math.random()}`,
        program_code: '1234',
        identification_number: `ID-${suffix}-${Math.random()}`,
        status: overrides.status ?? 'ACTIVE',
      },
    });
    createdCandidateIds.push(row.id);
    return row.id;
  }

  async function seedCandidacy(electionId: string, candidateId: string, positionNumber: number) {
    return repository.create(buildEntity(electionId, candidateId, positionNumber));
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

  it('I-07: returns candidacies ordered by position_number ascending', async () => {
    const electionId = await seedElection();
    const candidateA = await seedCandidate({ firstName: 'Ana', lastName: 'Lopez' });
    const candidateB = await seedCandidate({ firstName: 'Luis', lastName: 'Mora' });
    const candidateC = await seedCandidate({ firstName: 'Ursula', lastName: 'Ibarra' });
    await seedCandidacy(electionId, candidateA, 3);
    await seedCandidacy(electionId, candidateB, 1);
    await seedCandidacy(electionId, candidateC, 2);

    const result = await repository.findByElection(electionId);

    expect(result.map((row) => row.positionNumber)).toEqual([1, 2, 3]);
  });

  it('I-08: returns only the candidacies of the requested election', async () => {
    const electionA = await seedElection();
    const electionB = await seedElection();
    const candidateA = await seedCandidate();
    const candidateB = await seedCandidate();
    await seedCandidacy(electionA, candidateA, 1);
    await seedCandidacy(electionB, candidateB, 1);

    const result = await repository.findByElection(electionA);

    expect(result).toHaveLength(1);
    expect(result[0].electionId).toBe(electionA);
    expect(result[0].candidateId).toBe(candidateA);
  });

  it('I-09: exposes the candidate identity fields required by the query', async () => {
    const electionId = await seedElection();
    const candidateId = await seedCandidate({ firstName: 'Ana', lastName: 'Lopez' });
    await seedCandidacy(electionId, candidateId, 1);

    const result = await repository.findByElection(electionId);

    expect(result).toHaveLength(1);
    expect(result[0].candidateId).toBe(candidateId);
    expect(result[0].candidateFirstName).toBe('Ana');
    expect(result[0].candidateLastName).toBe('Lopez');
  });

  it('I-10: filters by a partial match on the candidate first name', async () => {
    const electionId = await seedElection();
    const candidateA = await seedCandidate({ firstName: 'Juan', lastName: 'Garcia' });
    const candidateB = await seedCandidate({ firstName: 'Maria', lastName: 'Garcia' });
    await seedCandidacy(electionId, candidateA, 1);
    await seedCandidacy(electionId, candidateB, 2);

    const result = await repository.findByElection(electionId, { candidateName: 'ju' });

    expect(result).toHaveLength(1);
    expect(result[0].candidateId).toBe(candidateA);
  });

  it('I-11: filters by a partial match on the candidate last name', async () => {
    const electionId = await seedElection();
    const candidateA = await seedCandidate({ firstName: 'Juan', lastName: 'Garcia' });
    const candidateB = await seedCandidate({ firstName: 'Juan', lastName: 'Perez' });
    await seedCandidacy(electionId, candidateA, 1);
    await seedCandidacy(electionId, candidateB, 2);

    const result = await repository.findByElection(electionId, { candidateName: 'per' });

    expect(result).toHaveLength(1);
    expect(result[0].candidateId).toBe(candidateB);
  });

  it('I-12: the candidateName filter is case-insensitive', async () => {
    const electionId = await seedElection();
    const candidateId = await seedCandidate({ firstName: 'Ana', lastName: 'Lopez' });
    await seedCandidacy(electionId, candidateId, 1);

    const result = await repository.findByElection(electionId, { candidateName: 'ANA' });

    expect(result).toHaveLength(1);
    expect(result[0].candidateId).toBe(candidateId);
  });

  it('I-13: trims the candidateName filter before matching', async () => {
    const electionId = await seedElection();
    const candidateId = await seedCandidate({ firstName: 'Ana', lastName: 'Lopez' });
    await seedCandidacy(electionId, candidateId, 1);

    const result = await repository.findByElection(electionId, { candidateName: '  lopez  ' });

    expect(result).toHaveLength(1);
    expect(result[0].candidateId).toBe(candidateId);
  });

  it('I-14: ignores an empty or whitespace-only candidateName and returns every candidacy', async () => {
    const electionId = await seedElection();
    const candidateA = await seedCandidate({ firstName: 'Ana', lastName: 'Lopez' });
    const candidateB = await seedCandidate({ firstName: 'Luis', lastName: 'Mora' });
    await seedCandidacy(electionId, candidateA, 1);
    await seedCandidacy(electionId, candidateB, 2);

    for (const candidateName of ['', '   ']) {
      const result = await repository.findByElection(electionId, { candidateName });
      expect(result).toHaveLength(2);
    }
  });

  it('I-15: the candidateName filter never returns INACTIVE candidates', async () => {
    const electionId = await seedElection();
    const active = await seedCandidate({ firstName: 'Ana', lastName: 'Lopez' });
    const inactive = await seedCandidate({
      firstName: 'Ana',
      lastName: 'Ibarra',
      status: 'INACTIVE',
    });
    await seedCandidacy(electionId, active, 1);
    await seedCandidacy(electionId, inactive, 2);

    const result = await repository.findByElection(electionId, { candidateName: 'ana' });

    expect(result).toHaveLength(1);
    expect(result[0].candidateId).toBe(active);
  });

  it('I-16: excludes INACTIVE candidates even without a candidateName filter', async () => {
    const electionId = await seedElection();
    const active = await seedCandidate({ firstName: 'Ana', lastName: 'Lopez' });
    const inactive = await seedCandidate({
      firstName: 'Luis',
      lastName: 'Mora',
      status: 'INACTIVE',
    });
    await seedCandidacy(electionId, active, 1);
    await seedCandidacy(electionId, inactive, 2);

    const result = await repository.findByElection(electionId);

    expect(result).toHaveLength(1);
    expect(result[0].candidateId).toBe(active);
  });

  it('I-17: returns rows with exactly the CandidacyWithCandidate projection shape', async () => {
    const electionId = await seedElection();
    const candidateId = await seedCandidate({ firstName: 'Ana', lastName: 'Lopez' });
    await seedCandidacy(electionId, candidateId, 1);

    const result = await repository.findByElection(electionId);

    expect(result).toHaveLength(1);
    expect(Object.keys(result[0]).sort()).toEqual([
      'candidateFirstName',
      'candidateId',
      'candidateLastName',
      'createdAt',
      'electionId',
      'id',
      'imageUrl',
      'positionNumber',
    ]);
    expect(result[0].createdAt).toBeInstanceOf(Date);
    expect(result[0].imageUrl).toBeNull();
  });

  it('I-18: returns an empty list for an election with no candidacies', async () => {
    const electionId = await seedElection();

    const result = await repository.findByElection(electionId);

    expect(result).toEqual([]);
  });
});
