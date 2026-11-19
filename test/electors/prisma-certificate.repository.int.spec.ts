import { PrismaService } from '../../src/shared/database/prisma.service';
import { PrismaCertificateRepository } from '../../src/modules/electors/infrastructure/repositories/prisma-certificate.repository';
import { nextTestElectionCode } from '../elections/election-code.utils';

describe('PrismaCertificateRepository integration', () => {
  let prisma: PrismaService;
  let repository: PrismaCertificateRepository;

  const suffix = Date.now();
  const usedElectionIds: string[] = [];
  const usedElectorIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    repository = new PrismaCertificateRepository(prisma);
  });

  afterEach(async () => {
    // FK order: certificates -> electoral_rolls -> elections / electors.
    await prisma.certificate.deleteMany({ where: { election_id: { in: usedElectionIds } } });
    await prisma.electoralRoll.deleteMany({ where: { election_id: { in: usedElectionIds } } });
    await prisma.election.deleteMany({ where: { id: { in: usedElectionIds } } });
    await prisma.elector.deleteMany({ where: { id: { in: usedElectorIds } } });
    usedElectionIds.length = 0;
    usedElectorIds.length = 0;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function seedRoll(): Promise<{ rollId: string; electionId: string }> {
    const election = await prisma.election.create({
      data: {
        electionCode: await nextTestElectionCode(prisma),
        name: `CERT-INT-${suffix}-${Math.random()}`,
        description: 'Integration test election.',
        start_date: new Date(Date.UTC(2026, 9, 1)),
        start_time: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        end_date: new Date(Date.UTC(2026, 9, 1)),
        end_time: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
      },
    });
    usedElectionIds.push(election.id);
    const elector = await prisma.elector.create({
      data: {
        first_name: 'Cert',
        last_name: 'Elector',
        email: `cert-int-${suffix}-${Math.random()}@example.com`,
        password_hash: 'pbkdf2$placeholder',
        student_code: `CERT-${suffix}-${Math.random().toString(36).slice(2, 8)}`,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    usedElectorIds.push(elector.id);
    const roll = await prisma.electoralRoll.create({
      data: { election_id: election.id, elector_id: elector.id },
    });
    return { rollId: roll.id, electionId: election.id };
  }

  it('CI-01: ensureForRoll creates a certificate with a 32-hex verification code', async () => {
    const { rollId, electionId } = await seedRoll();

    const certificate = await repository.ensureForRoll({ electoralRollId: rollId, electionId });

    expect(certificate.id).toEqual(expect.any(String));
    expect(certificate.electoralRollId).toBe(rollId);
    expect(certificate.electionId).toBe(electionId);
    expect(certificate.verificationCode).toMatch(/^[0-9a-f]{32}$/);
    expect(certificate.createdAt).toBeInstanceOf(Date);
  });

  it('CI-02: a second call reuses the same row and verification code', async () => {
    const { rollId, electionId } = await seedRoll();

    const first = await repository.ensureForRoll({ electoralRollId: rollId, electionId });
    const second = await repository.ensureForRoll({ electoralRollId: rollId, electionId });

    expect(second.id).toBe(first.id);
    expect(second.verificationCode).toBe(first.verificationCode);
    expect(await prisma.certificate.count({ where: { electoral_roll_id: rollId } })).toBe(1);
  });

  it('CI-03: concurrent calls resolve to a single row with one verification code', async () => {
    const { rollId, electionId } = await seedRoll();

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        repository.ensureForRoll({ electoralRollId: rollId, electionId }),
      ),
    );

    expect(new Set(results.map((c) => c.verificationCode)).size).toBe(1);
    expect(await prisma.certificate.count({ where: { electoral_roll_id: rollId } })).toBe(1);
  });

  it('CI-04: the unique constraint on electoral_roll_id rejects a duplicate row', async () => {
    const { rollId, electionId } = await seedRoll();
    await repository.ensureForRoll({ electoralRollId: rollId, electionId });

    await expect(
      prisma.certificate.create({
        data: {
          electoral_roll_id: rollId,
          election_id: electionId,
          verification_code: `dup-${suffix}-${Math.random()}`,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('CI-05: findByElectoralRollId returns null, then the mapped entity', async () => {
    const { rollId, electionId } = await seedRoll();

    await expect(repository.findByElectoralRollId(rollId)).resolves.toBeNull();

    const created = await repository.ensureForRoll({ electoralRollId: rollId, electionId });
    const found = await repository.findByElectoralRollId(rollId);

    expect(found).toMatchObject({
      id: created.id,
      electoralRollId: rollId,
      electionId,
      verificationCode: created.verificationCode,
    });
  });
});
