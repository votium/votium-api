import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { PrismaAnonymousVotingRepository } from '../../src/modules/anonymous-voting/infrastructure/repositories/prisma-anonymous-voting.repository';
import { BallotAlreadyUsedError } from '../../src/modules/anonymous-voting/domain/errors/ballot-already-used.error';
import { BallotCredentialAlreadyIssuedError } from '../../src/modules/anonymous-voting/domain/errors/ballot-credential-already-issued.error';
import { CommitmentAlreadyRegisteredError } from '../../src/modules/anonymous-voting/domain/errors/commitment-already-registered.error';
import { ElectionNotActiveError } from '../../src/modules/anonymous-voting/domain/errors/election-not-active.error';
import { nextTestElectionCode } from '../elections/election-code.utils';
import { randomUUID } from 'crypto';

const PAST = new Date('2026-01-01T00:00:00.000Z');
const TIME = new Date('1970-01-01T08:00:00.000Z');

describe('PrismaAnonymousVotingRepository (integration)', () => {
  let prisma: PrismaService;
  let repo: PrismaAnonymousVotingRepository;
  const suffix = Date.now();
  const electionIds: string[] = [];
  const electorIds: string[] = [];
  const candidacyIds: string[] = [];

  async function seedElection(status: 'ACTIVE' | 'CLOSED' = 'ACTIVE'): Promise<string> {
    const e = await prisma.election.create({
      data: {
        electionCode: await nextTestElectionCode(prisma),
        name: `ANON-REPO-${suffix}-${Math.random()}`,
        description: 'repo integration',
        start_date: PAST,
        start_time: TIME,
        end_date: PAST,
        end_time: TIME,
        current_status: status,
        blank_vote_enabled: true,
      },
    });
    electionIds.push(e.id);
    return e.id;
  }

  async function seedElector(): Promise<string> {
    const e = await prisma.elector.create({
      data: {
        first_name: 'Repo',
        last_name: 'Test',
        email: `anon-repo-${suffix}-${Math.random()}@example.com`,
        password_hash: 'x',
        student_code: `ANONREPO-${suffix}-${Math.random()}`,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    electorIds.push(e.id);
    return e.id;
  }

  async function seedCandidacy(electionId: string): Promise<string> {
    const candidate = await prisma.candidate.create({
      data: {
        first_name: 'C',
        last_name: 'D',
        student_code: `ANONC-${suffix}-${Math.random()}`,
        program_code: '1234',
        identification_number: `ANONI-${suffix}-${Math.random()}`,
        status: 'ACTIVE',
      },
    });
    const c = await prisma.candiday.create({
      data: {
        election_id: electionId,
        candidate_id: candidate.id,
        position_number: Math.floor(Math.random() * 1_000_000) + 1,
      },
    });
    candidacyIds.push(c.id);
    return c.id;
  }

  // Deterministic stand-in for the RSA signer: the repository only needs bytes back.
  const fakeSign = jest.fn(() => Promise.resolve(new Uint8Array([1, 2, 3])));

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      providers: [PrismaService],
    }).compile();
    prisma = moduleFixture.get(PrismaService);
    repo = new PrismaAnonymousVotingRepository(prisma);
  });

  afterAll(async () => {
    await prisma.anonymousVote.deleteMany({ where: { election_id: { in: electionIds } } });
    await prisma.anonymousCredential.deleteMany({ where: { election_id: { in: electionIds } } });
    await prisma.anonymousCommitment.deleteMany({ where: { election_id: { in: electionIds } } });
    await prisma.result.deleteMany({ where: { election_id: { in: electionIds } } });
    await prisma.anonymousElectionKey.deleteMany({ where: { election_id: { in: electionIds } } });
    await prisma.electoralRoll.deleteMany({ where: { election_id: { in: electionIds } } });
    await prisma.candiday.deleteMany({ where: { id: { in: candidacyIds } } });
    await prisma.election.deleteMany({ where: { id: { in: electionIds } } });
    await prisma.elector.deleteMany({ where: { id: { in: electorIds } } });
    await prisma.$disconnect();
  });

  beforeEach(() => fakeSign.mockClear());

  it('concurrent issueCredential for the same elector: exactly one credential is signed', async () => {
    const electionId = await seedElection('ACTIVE');
    const electorId = await seedElector();
    await repo.saveElectionKeyIfAbsent(electionId, { publicKeyPem: 'pem', privateKeyEnc: 'enc' });

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        repo.issueCredential(
          { electionId, electorId, y: String(i).padStart(64, 'e'), now: new Date() },
          fakeSign,
        ),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(rejected.every((r) => r.reason instanceof BallotCredentialAlreadyIssuedError)).toBe(
      true,
    );
    expect(
      await prisma.anonymousCredential.count({
        where: { election_id: electionId, elector_id: electorId },
      }),
    ).toBe(1);
    expect(await prisma.anonymousCommitment.count({ where: { election_id: electionId } })).toBe(1);
  });

  it('saveElectionKeyIfAbsent keeps the first key when called twice', async () => {
    const electionId = await seedElection('ACTIVE');
    await repo.saveElectionKeyIfAbsent(electionId, { publicKeyPem: 'first', privateKeyEnc: 'a' });
    await repo.saveElectionKeyIfAbsent(electionId, { publicKeyPem: 'second', privateKeyEnc: 'b' });

    expect(await repo.findElectionKey(electionId)).toEqual({
      publicKeyPem: 'first',
      privateKeyEnc: 'a',
    });
  });

  it('issueCredential signs once and records the issuance', async () => {
    const electionId = await seedElection('ACTIVE');
    const electorId = await seedElector();
    await repo.saveElectionKeyIfAbsent(electionId, { publicKeyPem: 'pem', privateKeyEnc: 'enc' });

    const sig = await repo.issueCredential(
      { electionId, electorId, y: 'a'.repeat(64), now: new Date() },
      fakeSign,
    );

    expect(sig).toEqual(new Uint8Array([1, 2, 3]));
    expect(fakeSign).toHaveBeenCalledTimes(1);
    expect(await repo.hasCredentialIssued(electionId, electorId)).toBe(true);
    expect(await repo.hasCommitment(electionId, 'a'.repeat(64))).toBe(true);
  });

  it('issueCredential rejects a second issuance for the same elector and election', async () => {
    const electionId = await seedElection('ACTIVE');
    const electorId = await seedElector();
    await repo.saveElectionKeyIfAbsent(electionId, { publicKeyPem: 'pem', privateKeyEnc: 'enc' });
    await repo.issueCredential(
      { electionId, electorId, y: 'b'.repeat(64), now: new Date() },
      fakeSign,
    );

    await expect(
      repo.issueCredential({ electionId, electorId, y: 'c'.repeat(64), now: new Date() }, fakeSign),
    ).rejects.toBeInstanceOf(BallotCredentialAlreadyIssuedError);
    // The rejected attempt must not leave a commitment behind.
    expect(await repo.hasCommitment(electionId, 'c'.repeat(64))).toBe(false);
  });

  it('issueCredential rejects a y already registered in the same election', async () => {
    const electionId = await seedElection('ACTIVE');
    await repo.saveElectionKeyIfAbsent(electionId, { publicKeyPem: 'pem', privateKeyEnc: 'enc' });
    await repo.issueCredential(
      { electionId, electorId: await seedElector(), y: 'd'.repeat(64), now: new Date() },
      fakeSign,
    );

    await expect(
      repo.issueCredential(
        { electionId, electorId: await seedElector(), y: 'd'.repeat(64), now: new Date() },
        fakeSign,
      ),
    ).rejects.toBeInstanceOf(CommitmentAlreadyRegisteredError);
  });

  it('issueCredential refuses when the election is not ACTIVE and never signs', async () => {
    const electionId = await seedElection('CLOSED');
    await repo.saveElectionKeyIfAbsent(electionId, { publicKeyPem: 'pem', privateKeyEnc: 'enc' });

    await expect(
      repo.issueCredential(
        { electionId, electorId: await seedElector(), y: 'e'.repeat(64), now: new Date() },
        fakeSign,
      ),
    ).rejects.toBeInstanceOf(ElectionNotActiveError);
    expect(fakeSign).not.toHaveBeenCalled();
  });

  it('castVote stores the ballot and increments the tally for a candidacy', async () => {
    const electionId = await seedElection('ACTIVE');
    const candidacyId = await seedCandidacy(electionId);
    const ballotId = randomUUID();

    await repo.castVote({ electionId, ballotId, candidacyId, now: new Date() });

    const receipt = await repo.findReceipt(electionId, ballotId);
    expect(receipt).not.toBeNull();
    expect(Object.keys(receipt!)).not.toContain('candidacyId');
    const tally = (await repo.tally(electionId)).find((r) => r.candidacyId === candidacyId);
    expect(tally?.votes).toBe(1);
  });

  it('castVote with the same ballotId twice throws BallotAlreadyUsedError', async () => {
    const electionId = await seedElection('ACTIVE');
    const candidacyId = await seedCandidacy(electionId);
    const ballotId = randomUUID();
    await repo.castVote({ electionId, ballotId, candidacyId, now: new Date() });

    await expect(
      repo.castVote({ electionId, ballotId, candidacyId, now: new Date() }),
    ).rejects.toBeInstanceOf(BallotAlreadyUsedError);

    const tally = (await repo.tally(electionId)).find((r) => r.candidacyId === candidacyId);
    expect(tally?.votes).toBe(1);
  });

  it('a blank vote is stored without a candidacy and does not touch the tally', async () => {
    const electionId = await seedElection('ACTIVE');
    const ballotId = randomUUID();

    await repo.castVote({ electionId, ballotId, candidacyId: null, now: new Date() });

    const row = await prisma.anonymousVote.findUnique({ where: { ballot_id: ballotId } });
    expect(row?.candidacy_id).toBeNull();
    expect((await repo.tally(electionId)).filter((r) => r.candidacyId !== null)).toHaveLength(0);
  });

  it('concurrent castVote with the same ballotId: exactly one succeeds', async () => {
    const electionId = await seedElection('ACTIVE');
    const candidacyId = await seedCandidacy(electionId);
    const ballotId = randomUUID();

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        repo.castVote({ electionId, ballotId, candidacyId, now: new Date() }),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected.every((r) => r.reason instanceof BallotAlreadyUsedError)).toBe(true);
    const tally = (await repo.tally(electionId)).find((r) => r.candidacyId === candidacyId);
    expect(tally?.votes).toBe(1);
  });

  it('concurrent castVote on the same candidacy with different ballots: no lost updates', async () => {
    const electionId = await seedElection('ACTIVE');
    const candidacyId = await seedCandidacy(electionId);

    await Promise.all(
      Array.from({ length: 6 }, () =>
        repo.castVote({ electionId, ballotId: randomUUID(), candidacyId, now: new Date() }),
      ),
    );

    const tally = (await repo.tally(electionId)).find((r) => r.candidacyId === candidacyId);
    expect(tally?.votes).toBe(6);
  });

  it('the anonymous_ballots table has no elector column and no link to ballot_issuances', async () => {
    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'anonymous_ballots'`;
    const names = columns.map((c) => c.column_name);
    expect(names).not.toEqual(expect.arrayContaining(['elector_id', 'issuance_id']));

    const fks = await prisma.$queryRaw<Array<{ ref: string }>>`
      SELECT ccu.table_name AS ref
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'anonymous_ballots' AND tc.constraint_type = 'FOREIGN KEY'`;
    expect(fks.map((f) => f.ref)).not.toContain('electors');
    expect(fks.map((f) => f.ref)).not.toContain('ballot_issuances');
  });
});
