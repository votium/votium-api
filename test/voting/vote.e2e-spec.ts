import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { GlobalExceptionFilter } from '../../src/shared/exceptions/filters/global-exception.filter';
import {
  ASYNC_EMAIL_SERVICE_PORT,
  type AsyncEmailServicePort,
} from '../../src/modules/auth/application/ports/async-email-service.port';
import { NodeCryptoPasswordHasherService } from '../../src/modules/iam/infrastructure/services/node-crypto-password-hasher.service';
import { RoleName } from '../../src/modules/iam/domain/value-objects/role-name.vo';
import { UserStatus } from '../../src/modules/iam/domain/value-objects/user-status.vo';
import type { ElectionStatus } from '../../src/modules/elections/domain/entities/election.entity';
import { extractAuthCookie } from '../auth/auth-cookie.utils';

class FakeEmailService implements AsyncEmailServicePort {
  sent: Array<{ to: string; code: string }> = [];

  sendVerificationCode(to: string, code: string): Promise<void> {
    return this.queueVerificationCode(to, code);
  }

  queueVerificationCode(to: string, code: string): Promise<void> {
    this.sent.push({ to, code });
    return Promise.resolve();
  }

  last(): { to: string; code: string } {
    return this.sent[this.sent.length - 1];
  }
}

interface LoginResponseBody {
  sessionId: string;
}

interface VoteResponseBody {
  electionId: string;
  candidacyId: string;
  registeredAt: string;
}

describe('Elector vote registration (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let emailService: FakeEmailService;

  let adminUser: { id: string; email: string; password: string };
  let elector1: { id: string; email: string; password: string };
  let elector2: { id: string; email: string; password: string };

  const suffix = Date.now();
  const password = 'SuperSecret123!';

  const usedElectorIds: string[] = [];
  const usedUserIds: string[] = [];
  const createdElectionIds: string[] = [];
  const createdCandidateIds: string[] = [];

  let adminToken = '';
  let electorToken = '';
  let elector2Token = '';

  const completeUserLogin = async (email: string, pwd: string): Promise<string> => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: pwd })
      .expect(201);

    const sessionId = (loginRes.body as LoginResponseBody).sessionId;
    const code = emailService.last().code;

    const verifyRes = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/verify')
      .send({ sessionId, code })
      .expect(201);

    return extractAuthCookie(verifyRes);
  };

  const completeElectorLogin = async (email: string, pwd: string): Promise<string> => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/electors/login')
      .send({ email, password: pwd })
      .expect(200);

    const sessionId = (loginRes.body as LoginResponseBody).sessionId;
    const code = emailService.last().code;

    const verifyRes = await request(app.getHttpServer())
      .post('/api/v1/auth/electors/mfa/verify')
      .send({ sessionId, code })
      .expect(201);

    return extractAuthCookie(verifyRes);
  };

  const postVote = (electionId: string, body: unknown, token?: string, idempotencyKey?: string) => {
    const req = request(app.getHttpServer()).post(`/api/v1/elections/${electionId}/votes`);
    if (token) req.set('Cookie', token);
    if (idempotencyKey !== undefined) req.set('Idempotency-Key', idempotencyKey);
    if (body !== undefined) req.send(body as object);
    return req;
  };

  const findRoll = (electionId: string, electorId: string) =>
    prisma.electoralRoll.findUnique({
      where: { election_id_elector_id: { election_id: electionId, elector_id: electorId } },
    });

  const findTally = (electionId: string, candidacyId: string) =>
    prisma.result.findUnique({
      where: { election_id_candidacy_id: { election_id: electionId, candidacy_id: candidacyId } },
    });

  async function seedElection(
    overrides: { status?: ElectionStatus; blankVoteEnabled?: boolean } = {},
  ): Promise<string> {
    const row = await prisma.election.create({
      data: {
        name: `E2E-VOTE-${suffix}-${Math.random()}`,
        description: 'E2E vote seed.',
        start_date: new Date(Date.UTC(2026, 9, 1)),
        start_time: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        end_date: new Date(Date.UTC(2026, 9, 1)),
        end_time: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
        current_status: overrides.status ?? 'ACTIVE',
        blank_vote_enabled: overrides.blankVoteEnabled ?? false,
      },
    });
    createdElectionIds.push(row.id);
    return row.id;
  }

  async function seedCandidate(overrides: { status?: string } = {}): Promise<string> {
    const row = await prisma.candidate.create({
      data: {
        first_name: 'E2E',
        last_name: 'Candidate',
        student_code: `SC-${suffix}-${Math.random()}`,
        program_code: '1234',
        identification_number: `ID-${suffix}-${Math.random()}`,
        status: overrides.status ?? 'ACTIVE',
      },
    });
    createdCandidateIds.push(row.id);
    return row.id;
  }

  async function seedCandidacy(electionId: string): Promise<string> {
    const candidateId = await seedCandidate();
    const row = await prisma.candiday.create({
      data: {
        election_id: electionId,
        candidate_id: candidateId,
        position_number: 1,
      },
    });
    return row.id;
  }

  async function seedRoll(electionId: string, electorId: string): Promise<void> {
    await prisma.electoralRoll.create({
      data: {
        election_id: electionId,
        elector_id: electorId,
        has_voted: false,
        vote_attempts: 0,
        last_vote_attempt: null,
      },
    });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ASYNC_EMAIL_SERVICE_PORT)
      .useValue(new FakeEmailService())
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    emailService = app.get<FakeEmailService>(ASYNC_EMAIL_SERVICE_PORT);

    const hasher = new NodeCryptoPasswordHasherService();
    const adminRole = await prisma.role.upsert({
      where: { name: RoleName.ADMINISTRATOR.value },
      update: {},
      create: { name: RoleName.ADMINISTRATOR.value },
    });

    adminUser = { id: '', email: `e2e-vote-admin-${suffix}@example.com`, password };
    const createdAdmin = await prisma.user.create({
      data: {
        first_name: 'E2E',
        last_name: 'Admin',
        email: adminUser.email,
        password_hash: await hasher.hash(password),
        role_id: adminRole.id,
        status: UserStatus.ACTIVE.value,
      },
    });
    adminUser.id = createdAdmin.id;
    usedUserIds.push(adminUser.id);

    const e1 = await prisma.elector.create({
      data: {
        first_name: 'Eve',
        last_name: 'Voter',
        email: `e2e-vote-v1-${suffix}@correounivalle.edu.co`,
        password_hash: await hasher.hash(password),
        student_code: `E2EVV1-${suffix}`,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    const e2 = await prisma.elector.create({
      data: {
        first_name: 'Vera',
        last_name: 'Voter',
        email: `e2e-vote-v2-${suffix}@correounivalle.edu.co`,
        password_hash: await hasher.hash(password),
        student_code: `E2EVV2-${suffix}`,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    usedElectorIds.push(e1.id, e2.id);
    elector1 = { id: e1.id, email: e1.email, password };
    elector2 = { id: e2.id, email: e2.email, password };

    adminToken = await completeUserLogin(adminUser.email, password);
    electorToken = await completeElectorLogin(elector1.email, password);
    elector2Token = await completeElectorLogin(elector2.email, password);
  });

  afterAll(async () => {
    await prisma.result.deleteMany({ where: { election_id: { in: createdElectionIds } } });
    await prisma.certificate.deleteMany({ where: { election_id: { in: createdElectionIds } } });
    await prisma.electoralRoll.deleteMany({ where: { election_id: { in: createdElectionIds } } });
    await prisma.candiday.deleteMany({ where: { election_id: { in: createdElectionIds } } });
    await prisma.candidate.deleteMany({ where: { id: { in: createdCandidateIds } } });
    await prisma.election.deleteMany({ where: { id: { in: createdElectionIds } } });
    await prisma.elector.deleteMany({ where: { id: { in: usedElectorIds } } });
    await prisma.mfaChallenge.deleteMany({ where: { user_id: { in: usedUserIds } } });
    await prisma.auditLog.deleteMany({ where: { user_id: { in: usedUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: usedUserIds } } });
    await app.close();
  });

  describe('POST /elections/:electionId/votes', () => {
    it('VE-01: registers a valid candidacy vote and increments the result tally', async () => {
      const electionId = await seedElection();
      const candidacyId = await seedCandidacy(electionId);
      await seedRoll(electionId, elector1.id);

      const res = await postVote(electionId, { candidacyId }, electorToken).expect(201);

      expect(res.body).toMatchObject({ electionId, candidacyId });
      const result = await prisma.result.findUnique({
        where: { election_id_candidacy_id: { election_id: electionId, candidacy_id: candidacyId } },
      });
      expect(result?.votes).toBe(1);
    });

    it('VE-02: registers a valid blank vote without creating a Result row', async () => {
      const electionId = await seedElection({ blankVoteEnabled: true });
      await seedCandidacy(electionId);
      await seedRoll(electionId, elector1.id);

      const res = await postVote(electionId, { candidacyId: 'blank' }, electorToken).expect(201);

      expect(res.body).toMatchObject({ electionId, candidacyId: 'blank' });
      const count = await prisma.result.count({ where: { election_id: electionId } });
      expect(count).toBe(0);
    });

    it('VE-03: returns exactly the documented response fields', async () => {
      const electionId = await seedElection();
      const candidacyId = await seedCandidacy(electionId);
      await seedRoll(electionId, elector1.id);

      const res = await postVote(electionId, { candidacyId }, electorToken).expect(201);
      const body = res.body as VoteResponseBody;

      expect(Object.keys(body).sort()).toEqual(['candidacyId', 'electionId', 'registeredAt']);
      expect(typeof body.registeredAt).toBe('string');
    });

    it('VE-04: leaks no identity, blockchain, certificate, or vote-attempt data', async () => {
      const electionId = await seedElection({ blankVoteEnabled: true });
      await seedCandidacy(electionId);
      await seedRoll(electionId, elector1.id);

      const res = await postVote(electionId, { candidacyId: 'blank' }, electorToken).expect(201);
      const lower = JSON.stringify(res.body).toLowerCase();

      expect(lower).not.toContain('password');
      expect(lower).not.toContain('studentcode');
      expect(lower).not.toContain('programcode');
      expect(lower).not.toContain('identificationnumber');
      expect(lower).not.toContain('elector');
      expect(lower).not.toContain('tx_hash');
      expect(lower).not.toContain('certificate');
      expect(lower).not.toContain('hasvoted');
    });

    it('VE-05: rejects an unauthenticated request with 401', async () => {
      const electionId = await seedElection();
      await seedCandidacy(electionId);

      await postVote(electionId, { candidacyId: 'any' }).expect(401);
    });

    it('VE-06: rejects a non-elector principal (admin) with 403', async () => {
      const electionId = await seedElection();
      const candidacyId = await seedCandidacy(electionId);

      await postVote(electionId, { candidacyId }, adminToken).expect(403);
    });

    it('VE-07: rejects a nonexistent election with 404', async () => {
      const res = await postVote(
        '00000000-0000-0000-0000-000000000000',
        { candidacyId: 'any' },
        electorToken,
      ).expect(404);

      expect(res.body).toMatchObject({ statusCode: 404, error: 'ELECTION_NOT_FOUND' });
    });

    it('VE-08: rejects a non-ACTIVE election with 409', async () => {
      const electionId = await seedElection({ status: 'PENDING' });
      await seedCandidacy(electionId);
      await seedRoll(electionId, elector1.id);

      const res = await postVote(electionId, { candidacyId: 'any' }, electorToken).expect(409);

      expect(res.body).toMatchObject({ statusCode: 409, error: 'ELECTION_NOT_ACTIVE' });
    });

    it('VE-09: rejects an elector not in the electoral roll with 404', async () => {
      const electionId = await seedElection();
      await seedCandidacy(electionId);
      // no roll for elector1 in this election

      const res = await postVote(electionId, { candidacyId: 'any' }, electorToken).expect(404);

      expect(res.body).toMatchObject({ statusCode: 404, error: 'ELECTORAL_ROLL_NOT_FOUND' });
    });

    it('VE-10: rejects an unknown / other-election / INACTIVE candidacy with 404', async () => {
      const electionId = await seedElection();
      await seedCandidacy(electionId);
      await seedRoll(electionId, elector1.id);

      const unknown = await postVote(
        electionId,
        { candidacyId: '00000000-0000-0000-0000-000000000000' },
        electorToken,
      ).expect(404);
      expect(unknown.body).toMatchObject({ statusCode: 404, error: 'CANDIDACY_NOT_FOUND' });

      // Candidacy from another election.
      const otherElection = await seedElection();
      const otherCandidacyId = await seedCandidacy(otherElection);
      const otherRes = await postVote(
        electionId,
        { candidacyId: otherCandidacyId },
        electorToken,
      ).expect(404);
      expect(otherRes.body).toMatchObject({ statusCode: 404, error: 'CANDIDACY_NOT_FOUND' });

      // INACTIVE candidate's candidacy.
      const inactiveElection = await seedElection();
      const inactiveCandidateId = await seedCandidate({ status: 'INACTIVE' });
      await prisma.candiday.create({
        data: {
          election_id: inactiveElection,
          candidate_id: inactiveCandidateId,
          position_number: 1,
        },
      });
      await seedRoll(inactiveElection, elector1.id);
      const inactiveCandidacy = await prisma.candiday.findFirst({
        where: { election_id: inactiveElection },
      });
      await postVote(inactiveElection, { candidacyId: inactiveCandidacy!.id }, electorToken).expect(
        404,
      );
    });

    it('VE-11: rejects a blank vote when blank voting is disabled with 409', async () => {
      const electionId = await seedElection({ blankVoteEnabled: false });
      await seedCandidacy(electionId);
      await seedRoll(electionId, elector1.id);

      const res = await postVote(electionId, { candidacyId: 'blank' }, electorToken).expect(409);

      expect(res.body).toMatchObject({ statusCode: 409, error: 'BLANK_VOTE_DISABLED' });
    });

    it('VE-12: rejects a missing or empty candidacyId with 400', async () => {
      const electionId = await seedElection();
      await seedCandidacy(electionId);
      await seedRoll(electionId, elector1.id);

      await postVote(electionId, {}, electorToken).expect(400);
      await postVote(electionId, { candidacyId: '' }, electorToken).expect(400);
      await postVote(electionId, { candidacyId: 123 }, electorToken).expect(400);
    });

    it('VE-13: rejects a non-UUID electionId with 400', async () => {
      await postVote('not-a-uuid', { candidacyId: 'any' }, electorToken).expect(400);
    });

    it('VE-14: rejects an unknown body field with 400 (forbidNonWhitelisted)', async () => {
      const electionId = await seedElection();
      await seedCandidacy(electionId);
      await seedRoll(electionId, elector1.id);

      await postVote(electionId, { candidacyId: 'any', extra: true }, electorToken).expect(400);
    });

    it('VE-R1: existing protected endpoints remain unchanged for the elector principal', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/elections')
        .set('Cookie', electorToken)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Cookie', elector2Token)
        .expect(403);
    });
  });

  describe('POST /elections/:electionId/votes — retry/idempotency (e2e)', () => {
    it('VE-RETRY-01: a first vote marks the roll as voted and records one tally', async () => {
      const electionId = await seedElection();
      const candidacyId = await seedCandidacy(electionId);
      await seedRoll(electionId, elector1.id);

      await postVote(electionId, { candidacyId }, electorToken, 'key-1').expect(201);

      const roll = await findRoll(electionId, elector1.id);
      expect(roll?.has_voted).toBe(true);
      expect(roll?.last_vote_candidacy_id).toBe(candidacyId);
      expect(roll?.last_vote_idempotency_key).toBe('key-1');

      const tally = await findTally(electionId, candidacyId);
      expect(tally?.votes).toBe(1);
    });

    it('VE-RETRY-02: a sequential retry with the same key returns 201 without another tally', async () => {
      const electionId = await seedElection();
      const candidacyId = await seedCandidacy(electionId);
      await seedRoll(electionId, elector1.id);

      const first = await postVote(electionId, { candidacyId }, electorToken, 'key-1').expect(201);
      const retry = await postVote(electionId, { candidacyId }, electorToken, 'key-1').expect(201);

      expect(retry.body).toMatchObject({
        electionId,
        candidacyId,
      });
      expect((retry.body as VoteResponseBody).registeredAt).toBe(
        (first.body as VoteResponseBody).registeredAt,
      );

      const tally = await findTally(electionId, candidacyId);
      expect(tally?.votes).toBe(1);
    });

    it('VE-RETRY-03: multiple sequential retries resolve to a single vote', async () => {
      const electionId = await seedElection();
      const candidacyId = await seedCandidacy(electionId);
      await seedRoll(electionId, elector1.id);

      for (let i = 0; i < 4; i += 1) {
        await postVote(electionId, { candidacyId }, electorToken, 'key-1').expect(201);
      }

      const tally = await findTally(electionId, candidacyId);
      expect(tally?.votes).toBe(1);

      const rollCount = await prisma.electoralRoll.count({ where: { election_id: electionId } });
      expect(rollCount).toBe(1);
    });

    it('VE-RETRY-04: a lost-response retry with the same key does not double-count', async () => {
      const electionId = await seedElection();
      const candidacyId = await seedCandidacy(electionId);
      await seedRoll(electionId, elector1.id);

      await postVote(electionId, { candidacyId }, electorToken, 'key-1').expect(201);
      // Simulate the client not receiving the response and retrying identically.
      const retry = await postVote(electionId, { candidacyId }, electorToken, 'key-1').expect(201);

      expect(retry.body).toMatchObject({ electionId, candidacyId });
      const tally = await findTally(electionId, candidacyId);
      expect(tally?.votes).toBe(1);
    });

    it('VE-RETRY-05: a duplicate vote with a different key returns 409', async () => {
      const electionId = await seedElection();
      const candidacyId = await seedCandidacy(electionId);
      await seedRoll(electionId, elector1.id);

      await postVote(electionId, { candidacyId }, electorToken, 'key-1').expect(201);
      const res = await postVote(electionId, { candidacyId }, electorToken, 'key-2').expect(409);

      expect(res.body).toMatchObject({ statusCode: 409, error: 'VOTE_ALREADY_REGISTERED' });
    });

    it('VE-RETRY-06: reusing a key with a different candidacy returns 409', async () => {
      const electionId = await seedElection();
      const candidacyA = await seedCandidacy(electionId);
      const candidateB = await seedCandidate();
      const candidacyB = await prisma.candiday.create({
        data: { election_id: electionId, candidate_id: candidateB, position_number: 2 },
      });
      await seedRoll(electionId, elector1.id);

      await postVote(electionId, { candidacyId: candidacyA }, electorToken, 'key-1').expect(201);
      const res = await postVote(
        electionId,
        { candidacyId: candidacyB.id },
        electorToken,
        'key-1',
      ).expect(409);

      expect(res.body).toMatchObject({ statusCode: 409, error: 'IDEMPOTENCY_KEY_CONFLICT' });
    });

    it('VE-RETRY-07: idempotency keys are isolated per elector', async () => {
      const electionId = await seedElection();
      const candidacyId = await seedCandidacy(electionId);
      await seedRoll(electionId, elector1.id);
      await seedRoll(electionId, elector2.id);

      await postVote(electionId, { candidacyId }, electorToken, 'key-shared').expect(201);
      await postVote(electionId, { candidacyId }, elector2Token, 'key-shared').expect(201);

      const tally = await findTally(electionId, candidacyId);
      expect(tally?.votes).toBe(2);

      const roll1 = await findRoll(electionId, elector1.id);
      const roll2 = await findRoll(electionId, elector2.id);
      expect(roll1?.has_voted).toBe(true);
      expect(roll2?.has_voted).toBe(true);
    });

    it('VE-RETRY-08: retry state is isolated per election', async () => {
      const electionA = await seedElection();
      const electionB = await seedElection();
      const candidacyA = await seedCandidacy(electionA);
      const candidacyB = await seedCandidacy(electionB);
      await seedRoll(electionA, elector1.id);
      await seedRoll(electionB, elector1.id);

      await postVote(electionA, { candidacyId: candidacyA }, electorToken, 'key-same').expect(201);
      await postVote(electionB, { candidacyId: candidacyB }, electorToken, 'key-same').expect(201);

      expect((await findTally(electionA, candidacyA))?.votes).toBe(1);
      expect((await findTally(electionB, candidacyB))?.votes).toBe(1);

      const replay = await postVote(
        electionA,
        { candidacyId: candidacyA },
        electorToken,
        'key-same',
      ).expect(201);
      expect(replay.body).toMatchObject({ electionId: electionA, candidacyId: candidacyA });
    });

    it('VE-RETRY-09: retries do not duplicate related records', async () => {
      const electionId = await seedElection();
      const candidacyId = await seedCandidacy(electionId);
      await seedRoll(electionId, elector1.id);

      await postVote(electionId, { candidacyId }, electorToken, 'key-1').expect(201);
      await postVote(electionId, { candidacyId }, electorToken, 'key-1').expect(201);
      await postVote(electionId, { candidacyId }, electorToken, 'key-1').expect(201);

      expect((await findTally(electionId, candidacyId))?.votes).toBe(1);
      expect(await prisma.electoralRoll.count({ where: { election_id: electionId } })).toBe(1);
      expect(await prisma.result.count({ where: { election_id: electionId } })).toBe(1);
    });

    it('VE-RETRY-10: a malformed Idempotency-Key header returns 400', async () => {
      const electionId = await seedElection();
      const candidacyId = await seedCandidacy(electionId);
      await seedRoll(electionId, elector1.id);

      await postVote(electionId, { candidacyId }, electorToken, '   ').expect(400);
    });

    it('VE-RETRY-11: a blank-vote retry is safe and creates no Result row', async () => {
      const electionId = await seedElection({ blankVoteEnabled: true });
      await seedRoll(electionId, elector1.id);

      await postVote(electionId, { candidacyId: 'blank' }, electorToken, 'key-blank').expect(201);
      const retry = await postVote(
        electionId,
        { candidacyId: 'blank' },
        electorToken,
        'key-blank',
      ).expect(201);

      expect(retry.body).toMatchObject({ electionId, candidacyId: 'blank' });

      const roll = await findRoll(electionId, elector1.id);
      expect(roll?.has_voted).toBe(true);
      expect(roll?.last_vote_candidacy_id).toBe('blank');
      expect(await prisma.result.count({ where: { election_id: electionId } })).toBe(0);
    });
  });
});
