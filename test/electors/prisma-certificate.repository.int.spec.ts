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
    await prisma.voteCredential.deleteMany({ where: { election_id: { in: usedElectionIds } } });
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
  describe('findByElectorId', () => {
    async function seedElector(): Promise<string> {
      const elector = await prisma.elector.create({
        data: {
          first_name: 'List',
          last_name: 'Elector',
          email: `cert-list-${suffix}-${Math.random()}@example.com`,
          password_hash: 'pbkdf2$placeholder',
          student_code: `CERTL-${suffix}-${Math.random().toString(36).slice(2, 8)}`,
          program_code: '2710',
          status: 'ACTIVE',
        },
      });
      usedElectorIds.push(elector.id);
      return elector.id;
    }

    async function seedMark(
      electorId: string,
      electionId: string,
      markStatus: 'NONE' | 'REPORTED' | 'MARKED' | 'REJECTED',
    ): Promise<void> {
      await prisma.electoralRoll.create({
        data: { election_id: electionId, elector_id: electorId },
      });
      await prisma.voteCredential.create({
        data: {
          election_id: electionId,
          elector_id: electorId,
          voter_hash: `hash-${Math.random()}`,
          blinded_message_hash: `blinded-${Math.random()}`,
          blind_signature: 'signature',
          mark_status: markStatus,
        },
      });
    }

    async function seedElection(name: string, startDay = 1): Promise<string> {
      const election = await prisma.election.create({
        data: {
          electionCode: await nextTestElectionCode(prisma),
          name: `${name}-${suffix}-${Math.random()}`,
          description: 'Integration test election.',
          start_date: new Date(Date.UTC(2026, 9, startDay)),
          start_time: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
          end_date: new Date(Date.UTC(2026, 9, 1)),
          end_time: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
        },
      });
      usedElectionIds.push(election.id);
      return election.id;
    }

    async function seedCertificate(
      electorId: string,
      electionId: string,
      createdAt: Date,
      votedAt: Date | null = null,
    ): Promise<{ rollId: string; code: string }> {
      const roll = await prisma.electoralRoll.create({
        data: {
          election_id: electionId,
          elector_id: electorId,
          has_voted: true,
          last_vote_registered_at: votedAt,
        },
      });
      const code = `${suffix}${Math.random().toString(16).slice(2)}`.slice(0, 32);
      await prisma.certificate.create({
        data: {
          electoral_roll_id: roll.id,
          election_id: electionId,
          verification_code: code,
          created_at: createdAt,
        },
      });
      return { rollId: roll.id, code };
    }

    it('CL-01: maps every item field and uses the election start as votingDate', async () => {
      const electorId = await seedElector();
      const electionId = await seedElection('CL01');
      const votedAt = new Date('2026-10-01T10:15:00.000Z');
      const issuedAt = new Date('2026-10-01T10:16:00.000Z');
      const { code } = await seedCertificate(electorId, electionId, issuedAt, votedAt);
      const election = await prisma.election.findUniqueOrThrow({ where: { id: electionId } });

      const result = await repository.findByElectorId({ electorId, page: 1, limit: 10 });

      expect(result).toEqual({
        items: [
          {
            electionId,
            electionName: election.name,
            votingDate: new Date('2026-10-01T08:00:00.000Z'),
            status: 'AVAILABLE',
            verificationCode: code,
            issuedAt,
          },
        ],
        total: 1,
      });
    });

    it('CL-02: uses the scheduled election start when the vote time is null', async () => {
      const electorId = await seedElector();
      const electionId = await seedElection('CL02');
      await seedCertificate(electorId, electionId, new Date('2026-10-02T00:00:00.000Z'));

      const { items } = await repository.findByElectorId({ electorId, page: 1, limit: 10 });

      expect(items[0].votingDate.toISOString()).toBe('2026-10-01T08:00:00.000Z');
    });

    it('CL-03: returns only the given elector certificates, even in a shared election', async () => {
      const electorA = await seedElector();
      const electorB = await seedElector();
      const electionId = await seedElection('CL03');
      const { code: codeA } = await seedCertificate(electorA, electionId, new Date());
      await seedCertificate(electorB, electionId, new Date());

      const result = await repository.findByElectorId({ electorId: electorA, page: 1, limit: 10 });

      expect(result.total).toBe(1);
      expect(result.items.map((i) => i.verificationCode)).toEqual([codeA]);
    });

    it('CL-04: orders by election start desc and breaks ties by roll id desc', async () => {
      const electorId = await seedElector();
      const issuedAt = new Date('2026-10-20T00:00:00.000Z');
      const old = await seedCertificate(electorId, await seedElection('CL04a', 1), issuedAt);
      const t1 = await seedCertificate(electorId, await seedElection('CL04b', 5), issuedAt);
      const t2 = await seedCertificate(electorId, await seedElection('CL04c', 5), issuedAt);
      const recent = await seedCertificate(electorId, await seedElection('CL04d', 9), issuedAt);

      const { items } = await repository.findByElectorId({ electorId, page: 1, limit: 10 });

      const tied = [t1, t2].sort((a, b) => (a.rollId < b.rollId ? 1 : -1));
      expect(items.map((i) => i.verificationCode)).toEqual([
        recent.code,
        tied[0].code,
        tied[1].code,
        old.code,
      ]);
    });

    it('CL-05: paginates with skip/take and counts the total without paging', async () => {
      const electorId = await seedElector();
      const codes: string[] = [];
      for (let i = 0; i < 5; i++) {
        const { code } = await seedCertificate(
          electorId,
          await seedElection(`CL05-${i}`, 10 - i),
          new Date(Date.UTC(2026, 9, 10 - i)),
        );
        codes.push(code);
      }

      const page2 = await repository.findByElectorId({ electorId, page: 2, limit: 2 });
      const page9 = await repository.findByElectorId({ electorId, page: 9, limit: 2 });

      expect(page2.total).toBe(5);
      expect(page2.items.map((i) => i.verificationCode)).toEqual([codes[2], codes[3]]);
      expect(page9).toEqual({ items: [], total: 5 });
    });

    it('CL-06: returns an empty page when the elector has no certificates', async () => {
      const electorId = await seedElector();
      const electionId = await seedElection('CL06');
      await prisma.electoralRoll.create({
        data: { election_id: electionId, elector_id: electorId },
      });

      await expect(repository.findByElectorId({ electorId, page: 1, limit: 10 })).resolves.toEqual({
        items: [],
        total: 0,
      });
    });

    it('CL-07: items carry only the six contract fields', async () => {
      const electorId = await seedElector();
      await seedCertificate(electorId, await seedElection('CL07'), new Date());

      const { items } = await repository.findByElectorId({ electorId, page: 1, limit: 10 });

      expect(Object.keys(items[0]).sort()).toEqual([
        'electionId',
        'electionName',
        'issuedAt',
        'status',
        'verificationCode',
        'votingDate',
      ]);
    });

    it.each([
      ['MARKED', 'AVAILABLE'],
      ['REPORTED', 'PROCESSING'],
    ] as const)('CL-09: lists a %s mark as %s without a certificate', async (mark, status) => {
      const electorId = await seedElector();
      const electionId = await seedElection('CL09');
      await seedMark(electorId, electionId, mark);

      const { items, total } = await repository.findByElectorId({ electorId, page: 1, limit: 10 });

      expect(total).toBe(1);
      expect(items[0]).toMatchObject({
        electionId,
        status,
        verificationCode: null,
        issuedAt: null,
      });
      expect(await prisma.certificate.count({ where: { election_id: electionId } })).toBe(0);
    });

    it.each(['NONE', 'REJECTED'] as const)('CL-10: excludes a %s mark', async (mark) => {
      const electorId = await seedElector();
      await seedMark(electorId, await seedElection('CL10'), mark);

      await expect(repository.findByElectorId({ electorId, page: 1, limit: 10 })).resolves.toEqual({
        items: [],
        total: 0,
      });
    });

    it('CL-11: does not list another elector mark in a shared election', async () => {
      const electorA = await seedElector();
      const electorB = await seedElector();
      const electionId = await seedElection('CL11');
      await prisma.electoralRoll.create({
        data: { election_id: electionId, elector_id: electorA },
      });
      await seedMark(electorB, electionId, 'MARKED');

      const result = await repository.findByElectorId({ electorId: electorA, page: 1, limit: 10 });

      expect(result).toEqual({ items: [], total: 0 });
    });

    it('CL-08: the electoral_rolls elector_id index exists', async () => {
      const rows = await prisma.$queryRaw<{ indexname: string }[]>`
        SELECT indexname FROM pg_indexes
        WHERE tablename = 'electoral_rolls' AND indexname = 'electoral_rolls_elector_id_idx'`;

      expect(rows).toHaveLength(1);
    });
  });
});
