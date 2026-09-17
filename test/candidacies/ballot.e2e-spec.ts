import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { GlobalExceptionFilter } from '../../src/shared/exceptions/filters/global-exception.filter';
import {
  EMAIL_SERVICE_PORT,
  type EmailServicePort,
} from '../../src/modules/auth/application/ports/email-service.port';
import { NodeCryptoPasswordHasherService } from '../../src/modules/iam/infrastructure/services/node-crypto-password-hasher.service';
import { RoleName } from '../../src/modules/iam/domain/value-objects/role-name.vo';
import { UserStatus } from '../../src/modules/iam/domain/value-objects/user-status.vo';
import type { ElectionStatus } from '../../src/modules/elections/domain/entities/election.entity';
import { envs } from '../../src/config';

class FakeEmailService implements EmailServicePort {
  sent: Array<{ to: string; code: string }> = [];

  sendVerificationCode(to: string, code: string): Promise<void> {
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

interface TokensResponseBody {
  accessToken: string;
}

interface BallotBody {
  election: { id: string; name: string };
  candidacies: Array<{
    id: string;
    positionNumber: number;
    imageUrl: string | null;
    createdAt: string;
    candidate: { id: string; firstName: string; lastName: string };
  }>;
  blankVote: { id: string; enabled: boolean };
}

interface SwaggerOperationShape {
  tags?: string[];
  summary?: string;
  security?: Array<Record<string, string[]>>;
  parameters?: Array<{ name?: string; in?: string; required?: boolean }>;
  responses?: Record<string, { content?: { 'application/json'?: { schema?: { $ref?: string } } } }>;
}

describe('Election ballot retrieval (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let emailService: FakeEmailService;

  let adminUser: { id: string; email: string; password: string };
  let auditorUser: { id: string; email: string; password: string };
  let elector1: { id: string; email: string; password: string; studentCode: string };
  let elector2: { id: string; email: string; password: string; studentCode: string };

  const suffix = Date.now();
  const password = 'SuperSecret123!';

  const usedElectorIds: string[] = [];
  const usedUserIds: string[] = [];
  const createdElectionIds: string[] = [];
  const createdCandidateIds: string[] = [];

  let adminToken = '';
  let auditorToken = '';
  let electorToken = '';

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

    return (verifyRes.body as TokensResponseBody).accessToken;
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

    return (verifyRes.body as TokensResponseBody).accessToken;
  };

  const getBallot = (electionId: string, token?: string) => {
    const req = request(app.getHttpServer()).get(`/api/v1/elections/${electionId}/ballot`);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  async function seedElection(
    overrides: { status?: ElectionStatus; blankVoteEnabled?: boolean; name?: string } = {},
  ): Promise<string> {
    const row = await prisma.election.create({
      data: {
        name: overrides.name ?? `E2E-BT-${suffix}-${Math.random()}`,
        description: 'E2E ballot seed.',
        start_date: new Date(Date.UTC(2026, 9, 1)),
        start_time: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        end_date: new Date(Date.UTC(2026, 9, 1)),
        end_time: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
        current_status: overrides.status ?? 'PENDING',
        blank_vote_enabled: overrides.blankVoteEnabled ?? false,
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
        first_name: overrides.firstName ?? 'E2E',
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

  async function seedCandidacy(
    electionId: string,
    candidateId: string,
    positionNumber: number,
  ): Promise<void> {
    await prisma.candiday.create({
      data: {
        election_id: electionId,
        candidate_id: candidateId,
        position_number: positionNumber,
      },
    });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EMAIL_SERVICE_PORT)
      .useValue(new FakeEmailService())
      .compile();

    app = moduleFixture.createNestApplication();
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
    emailService = app.get<FakeEmailService>(EMAIL_SERVICE_PORT);

    const hasher = new NodeCryptoPasswordHasherService();
    const adminRole = await prisma.role.upsert({
      where: { name: RoleName.ADMINISTRATOR.value },
      update: {},
      create: { name: RoleName.ADMINISTRATOR.value },
    });
    const auditorRole = await prisma.role.upsert({
      where: { name: RoleName.AUDITOR.value },
      update: {},
      create: { name: RoleName.AUDITOR.value },
    });

    adminUser = {
      id: '',
      email: `e2e-ballot-admin-${suffix}@example.com`,
      password,
    };
    auditorUser = {
      id: '',
      email: `e2e-ballot-auditor-${suffix}@example.com`,
      password,
    };

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
    const createdAuditor = await prisma.user.create({
      data: {
        first_name: 'E2E',
        last_name: 'Auditor',
        email: auditorUser.email,
        password_hash: await hasher.hash(password),
        role_id: auditorRole.id,
        status: UserStatus.ACTIVE.value,
      },
    });
    adminUser.id = createdAdmin.id;
    auditorUser.id = createdAuditor.id;
    usedUserIds.push(adminUser.id, auditorUser.id);

    const e1 = await prisma.elector.create({
      data: {
        first_name: 'Eve',
        last_name: 'Voter',
        email: `e2e-ballot-v1-${suffix}@correounivalle.edu.co`,
        password_hash: await hasher.hash(password),
        student_code: `E2EBTV1-${suffix}`,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    const e2 = await prisma.elector.create({
      data: {
        first_name: 'Vera',
        last_name: 'Rolled',
        email: `e2e-ballot-v2-${suffix}@correounivalle.edu.co`,
        password_hash: await hasher.hash(password),
        student_code: `E2EBTV2-${suffix}`,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    usedElectorIds.push(e1.id, e2.id);
    elector1 = {
      id: e1.id,
      email: e1.email,
      password,
      studentCode: e1.student_code,
    };
    elector2 = {
      id: e2.id,
      email: e2.email,
      password,
      studentCode: e2.student_code,
    };

    adminToken = await completeUserLogin(adminUser.email, password);
    auditorToken = await completeUserLogin(auditorUser.email, password);
    electorToken = await completeElectorLogin(elector1.email, password);
    await completeElectorLogin(elector2.email, password);
  });

  afterAll(async () => {
    await prisma.electoralRoll.deleteMany({
      where: { election_id: { in: createdElectionIds } },
    });
    await prisma.candiday.deleteMany({
      where: { election_id: { in: createdElectionIds } },
    });
    await prisma.candidate.deleteMany({ where: { id: { in: createdCandidateIds } } });
    await prisma.election.deleteMany({ where: { id: { in: createdElectionIds } } });
    await prisma.elector.deleteMany({ where: { id: { in: usedElectorIds } } });
    await prisma.mfaChallenge.deleteMany({ where: { user_id: { in: usedUserIds } } });
    await prisma.auditLog.deleteMany({ where: { user_id: { in: usedUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: usedUserIds } } });
    await app.close();
  });

  describe('GET /elections/:electionId/ballot', () => {
    it('E2E-B01: the endpoint is exposed under /api/v1/elections/:id/ballot', async () => {
      const electionId = await seedElection();
      const candidateId = await seedCandidate();
      await seedCandidacy(electionId, candidateId, 1);

      await getBallot(electionId, adminToken).expect(200);
    });

    it('E2E-B02: an ADMIN retrieves the ballot with the election brief and candidacy ids', async () => {
      const name = `E2E-BT-B02-${suffix}`;
      const electionId = await seedElection({ name, blankVoteEnabled: true });
      const candidateId = await seedCandidate({ firstName: 'Ana', lastName: 'Lopez' });
      await seedCandidacy(electionId, candidateId, 1);

      const res = await getBallot(electionId, adminToken).expect(200);
      const body = res.body as BallotBody;

      expect(body.election).toEqual({ id: electionId, name });
      expect(body.candidacies).toHaveLength(1);
      expect(body.candidacies[0].id).not.toBe(candidateId);
      expect(body.candidacies[0].candidate.id).toBe(candidateId);
      expect(body.candidacies[0].candidate.firstName).toBe('Ana');
      expect(body.blankVote).toEqual({ id: 'blank', enabled: true });
    });

    it('E2E-B03: an AUDITOR retrieves the ballot', async () => {
      const electionId = await seedElection();
      const candidateId = await seedCandidate({ firstName: 'Ana', lastName: 'Lopez' });
      await seedCandidacy(electionId, candidateId, 1);

      const res = await getBallot(electionId, auditorToken).expect(200);
      const body = res.body as BallotBody;

      expect(body.candidacies).toHaveLength(1);
      expect(body.candidacies[0].candidate.lastName).toBe('Lopez');
    });

    it('E2E-B04: a VOTER/elector retrieves the ballot without requiring an electoral-roll entry', async () => {
      const electionId = await seedElection();
      const candidateId = await seedCandidate();
      await seedCandidacy(electionId, candidateId, 1);

      const res = await getBallot(electionId, electorToken).expect(200);
      const body = res.body as BallotBody;

      expect(body.candidacies).toHaveLength(1);
    });

    it('E2E-B04b: an elector with an electoral-roll entry also retrieves the ballot', async () => {
      const electionId = await seedElection();
      const candidateId = await seedCandidate();
      await seedCandidacy(electionId, candidateId, 1);
      await prisma.electoralRoll.create({
        data: {
          election_id: electionId,
          elector_id: elector2.id,
          has_voted: false,
          vote_attempts: 0,
          last_vote_attempt: null,
        },
      });

      const firstToken = await completeElectorLogin(elector2.email, password);
      const res = await getBallot(electionId, firstToken).expect(200);
      const body = res.body as BallotBody;

      expect(body.candidacies).toHaveLength(1);
    });

    it('E2E-B05: only valid (ACTIVE) candidates of the election are returned', async () => {
      const electionId = await seedElection();
      const candidateA = await seedCandidate({ firstName: 'Ana', lastName: 'Lopez' });
      const candidateB = await seedCandidate({ firstName: 'Luis', lastName: 'Mora' });
      await seedCandidacy(electionId, candidateA, 1);
      await seedCandidacy(electionId, candidateB, 2);

      const res = await getBallot(electionId, adminToken).expect(200);
      const body = res.body as BallotBody;

      expect(body.candidacies).toHaveLength(2);
    });

    it('E2E-B06: INACTIVE candidates are excluded without renumbering', async () => {
      const electionId = await seedElection();
      const active = await seedCandidate({ firstName: 'Ana', lastName: 'Lopez' });
      const inactive = await seedCandidate({
        firstName: 'Luis',
        lastName: 'Mora',
        status: 'INACTIVE',
      });
      await seedCandidacy(electionId, active, 1);
      await seedCandidacy(electionId, inactive, 2);

      const res = await getBallot(electionId, adminToken).expect(200);
      const body = res.body as BallotBody;

      expect(body.candidacies).toHaveLength(1);
      expect(body.candidacies[0].candidate.firstName).toBe('Ana');
      expect(body.candidacies[0].positionNumber).toBe(1);
    });

    it('E2E-B07: candidates from another election are excluded', async () => {
      const electionA = await seedElection();
      const electionB = await seedElection();
      const candidateA = await seedCandidate({ firstName: 'Ana', lastName: 'Lopez' });
      const candidateB = await seedCandidate({ firstName: 'Luis', lastName: 'Mora' });
      await seedCandidacy(electionA, candidateA, 1);
      await seedCandidacy(electionB, candidateB, 1);

      const res = await getBallot(electionA, adminToken).expect(200);
      const body = res.body as BallotBody;

      expect(body.candidacies).toHaveLength(1);
      expect(body.candidacies[0].candidate.lastName).toBe('Lopez');
    });

    it('E2E-B08: numbers are preserved and ordering is deterministic (1, 3, 4)', async () => {
      const electionId = await seedElection();
      const c1 = await seedCandidate({ firstName: 'Ana', lastName: 'Lopez' });
      const cInactive = await seedCandidate({
        firstName: 'Luis',
        lastName: 'Mora',
        status: 'INACTIVE',
      });
      const c3 = await seedCandidate({ firstName: 'Ursula', lastName: 'Ibarra' });
      const c4 = await seedCandidate({ firstName: 'Pablo', lastName: 'Rios' });
      await seedCandidacy(electionId, c1, 1);
      await seedCandidacy(electionId, cInactive, 2);
      await seedCandidacy(electionId, c3, 3);
      await seedCandidacy(electionId, c4, 4);

      const res = await getBallot(electionId, adminToken).expect(200);
      const body = res.body as BallotBody;

      expect(body.candidacies.map((c) => c.positionNumber)).toEqual([1, 3, 4]);
    });

    it('E2E-B09: a ballot with blank voting enabled exposes the blank-vote option as available', async () => {
      const electionId = await seedElection({ blankVoteEnabled: true });
      const candidateId = await seedCandidate();
      await seedCandidacy(electionId, candidateId, 1);

      const res = await getBallot(electionId, adminToken).expect(200);
      const body = res.body as BallotBody;

      expect(body.blankVote).toEqual({ id: 'blank', enabled: true });
      expect(body.candidacies).toHaveLength(1);
    });

    it('E2E-B10: blank voting disabled still exposes the blank-vote option as available (read-only display override)', async () => {
      const electionId = await seedElection({ blankVoteEnabled: false });
      const candidateId = await seedCandidate();
      await seedCandidacy(electionId, candidateId, 1);

      const beforeElection = await prisma.election.findUnique({
        where: { id: electionId },
      });

      const res = await getBallot(electionId, adminToken).expect(200);
      const body = res.body as BallotBody;

      expect(body.blankVote).toEqual({ id: 'blank', enabled: true });
      expect(body.candidacies).toHaveLength(1);

      // The override is presentation-only: the stored configuration is never modified.
      const afterElection = await prisma.election.findUnique({ where: { id: electionId } });
      expect(afterElection).toEqual(beforeElection);
      expect(afterElection?.blank_vote_enabled).toBe(false);
    });

    it('E2E-B11: an unauthenticated request is rejected with 401', async () => {
      const electionId = await seedElection();
      const candidateId = await seedCandidate();
      await seedCandidacy(electionId, candidateId, 1);

      await getBallot(electionId).expect(401);
      await getBallot(electionId, 'not-a-real-token').expect(401);
    });

    it('E2E-B12: an authenticated unauthorized role is rejected with 403', async () => {
      const electionId = await seedElection();
      const candidateId = await seedCandidate();
      await seedCandidacy(electionId, candidateId, 1);

      const supervisor = jwt.sign(
        { sub: adminUser.id, email: adminUser.email, actorType: 'USER', role: 'SUPERVISOR' },
        envs.jwtSecret,
        { expiresIn: envs.jwtExpiresIn },
      );
      const noRole = jwt.sign(
        { sub: adminUser.id, email: adminUser.email, actorType: 'USER' },
        envs.jwtSecret,
        { expiresIn: envs.jwtExpiresIn },
      );

      await getBallot(electionId, supervisor).expect(403);
      await getBallot(electionId, noRole).expect(403);
    });

    it('E2E-B13: the ELECTOR actor-type check is case-sensitive', async () => {
      const electionId = await seedElection();
      const candidateId = await seedCandidate();
      await seedCandidacy(electionId, candidateId, 1);

      const bad = jwt.sign(
        { sub: elector1.id, email: elector1.email, actorType: 'elector' },
        envs.jwtSecret,
        { expiresIn: envs.jwtExpiresIn },
      );

      await getBallot(electionId, bad).expect(403);
    });

    it('E2E-B14: a nonexistent election is rejected with 404', async () => {
      const res = await getBallot('00000000-0000-0000-0000-000000000000', adminToken).expect(404);

      expect(res.body).toMatchObject({ statusCode: 404, error: 'ELECTION_NOT_FOUND' });
    });

    it('E2E-B15: a non-UUID electionId is rejected with 400', async () => {
      await getBallot('not-a-uuid', adminToken).expect(400);
    });

    it('E2E-B16: an election without valid candidates is rejected with 409', async () => {
      const emptyElection = await seedElection();
      const res = await getBallot(emptyElection, adminToken).expect(409);
      expect(res.body).toMatchObject({
        statusCode: 409,
        error: 'ELECTION_NO_VALID_CANDIDATES',
      });

      const onlyInactive = await seedElection();
      const inactive = await seedCandidate({ status: 'INACTIVE' });
      await seedCandidacy(onlyInactive, inactive, 1);
      const res2 = await getBallot(onlyInactive, adminToken).expect(409);
      expect(res2.body).toMatchObject({
        statusCode: 409,
        error: 'ELECTION_NO_VALID_CANDIDATES',
      });
    });

    it('E2E-B17: the response contains exactly the documented fields', async () => {
      const electionId = await seedElection({ blankVoteEnabled: true });
      const candidateId = await seedCandidate({ firstName: 'Ana', lastName: 'Lopez' });
      await seedCandidacy(electionId, candidateId, 1);

      const res = await getBallot(electionId, adminToken).expect(200);
      const body = res.body as BallotBody;

      expect(Object.keys(body).sort()).toEqual(['blankVote', 'candidacies', 'election']);
      expect(Object.keys(body.election).sort()).toEqual(['id', 'name']);
      const item = body.candidacies[0];
      expect(Object.keys(item).sort()).toEqual([
        'candidate',
        'createdAt',
        'id',
        'imageUrl',
        'positionNumber',
      ]);
      expect(Object.keys(item.candidate).sort()).toEqual(['firstName', 'id', 'lastName']);
    });

    it('E2E-B18: no sensitive information leaks in the response', async () => {
      const electionId = await seedElection();
      const candidateId = await seedCandidate();
      await seedCandidacy(electionId, candidateId, 1);

      const res = await getBallot(electionId, adminToken).expect(200);
      const lower = JSON.stringify(res.body).toLowerCase();

      expect(lower).not.toContain('password');
      expect(lower).not.toContain('studentcode');
      expect(lower).not.toContain('programcode');
      expect(lower).not.toContain('identificationnumber');
      expect(lower).not.toContain('status');
      expect(lower).not.toContain(envs.jwtSecret);
      expect(lower).not.toContain(adminToken);
    });

    it('E2E-B19: retrieving the ballot does not modify the election or any related records', async () => {
      const electionId = await seedElection({ blankVoteEnabled: true });
      const candidateId = await seedCandidate();
      await seedCandidacy(electionId, candidateId, 1);

      const beforeElection = await prisma.election.findUnique({ where: { id: electionId } });
      const beforeCounts = {
        candidacies: await prisma.candiday.count({ where: { election_id: electionId } }),
        results: await prisma.result.count({ where: { election_id: electionId } }),
        voteMetadata: await prisma.voteMetadata.count({ where: { election_id: electionId } }),
        electoralRolls: await prisma.electoralRoll.count({
          where: { election_id: electionId },
        }),
        certificates: await prisma.certificate.count({ where: { election_id: electionId } }),
      };

      await getBallot(electionId, adminToken).expect(200);

      const afterElection = await prisma.election.findUnique({ where: { id: electionId } });
      const afterCounts = {
        candidacies: await prisma.candiday.count({ where: { election_id: electionId } }),
        results: await prisma.result.count({ where: { election_id: electionId } }),
        voteMetadata: await prisma.voteMetadata.count({ where: { election_id: electionId } }),
        electoralRolls: await prisma.electoralRoll.count({
          where: { election_id: electionId },
        }),
        certificates: await prisma.certificate.count({ where: { election_id: electionId } }),
      };

      expect(afterElection).toEqual(beforeElection);
      expect(afterCounts).toEqual(beforeCounts);
    });

    it('E2E-B20: retrieving the ballot leaves elector voting state unchanged', async () => {
      const electionId = await seedElection();
      const candidateId = await seedCandidate();
      await seedCandidacy(electionId, candidateId, 1);
      await prisma.electoralRoll.create({
        data: {
          election_id: electionId,
          elector_id: elector1.id,
          has_voted: false,
          vote_attempts: 0,
          last_vote_attempt: null,
        },
      });

      const beforeRoll = await prisma.electoralRoll.findUnique({
        where: { election_id_elector_id: { election_id: electionId, elector_id: elector1.id } },
      });

      await getBallot(electionId, electorToken).expect(200);

      const afterRoll = await prisma.electoralRoll.findUnique({
        where: { election_id_elector_id: { election_id: electionId, elector_id: elector1.id } },
      });
      const voteCount = await prisma.voteMetadata.count({ where: { election_id: electionId } });

      expect(afterRoll).toEqual(beforeRoll);
      expect(afterRoll?.has_voted).toBe(false);
      expect(afterRoll?.vote_attempts).toBe(0);
      expect(afterRoll?.last_vote_attempt).toBeNull();
      expect(voteCount).toBe(0);
    });
  });

  describe('regression: existing protected endpoints unchanged', () => {
    it('E2E-R1: an ELECTOR token is still rejected on /elections with 403', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/elections')
        .set('Authorization', `Bearer ${electorToken}`)
        .expect(403);
    });

    it('E2E-R2: an ELECTOR token is still rejected on /users and a USER token on /auth/electors/me', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${electorToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/auth/electors/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('E2E-R3: the election candidacies endpoint keeps its authorization unchanged', async () => {
      const electionId = await seedElection();
      const candidateId = await seedCandidate();
      await seedCandidacy(electionId, candidateId, 1);

      await request(app.getHttpServer())
        .get(`/api/v1/elections/${electionId}/candidacies`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/elections/${electionId}/candidacies`)
        .set('Authorization', `Bearer ${electorToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/elections/00000000-0000-0000-0000-000000000000/candidacies')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('Swagger / OpenAPI', () => {
    it('SW1-SW8: the generated OpenAPI document documents the endpoint', () => {
      const config = new DocumentBuilder()
        .setTitle('Votium API')
        .setDescription('Electronic voting system API')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
      const document = SwaggerModule.createDocument(app, config);

      // SW1: the path exists (global prefix may be prefixed depending on the
      // running NestJS/swagger version).
      const pathKey = Object.keys(document.paths).find((p) =>
        p.endsWith('/elections/{electionId}/ballot'),
      );
      expect(pathKey).toBeDefined();
      const operation = document.paths[pathKey!].get as unknown as SwaggerOperationShape;
      expect(operation).toBeDefined();

      // SW2: the operation is grouped under the candidacies tag.
      expect(operation.tags).toContain('candidacies');

      // SW3: the election identifier path parameter is documented.
      expect(operation.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'electionId',
            in: 'path',
            required: true,
          }),
        ]),
      );

      // SW4: no query or body parameters are documented (none expected).
      const paramNames = (operation.parameters ?? []).map((p) => `${p.in}:${p.name}`);
      expect(paramNames).toEqual(['path:electionId']);

      // SW5: authentication is documented at the operation level.
      expect(operation.security).toEqual([{ bearer: [] }]);
      expect(document.components?.securitySchemes?.bearer).toBeDefined();

      // SW6: the successful response schema matches the runtime response.
      const success = operation.responses?.['200'];
      expect(success).toBeDefined();
      const schemaRef = success?.content?.['application/json']?.schema?.$ref;
      expect(schemaRef).toBe('#/components/schemas/BallotResponseDto');
      const responseSchema = document.components?.schemas?.['BallotResponseDto'] as
        | {
            properties?: {
              election?: { $ref?: string };
              candidacies?: { type?: string; items?: { $ref?: string } };
              blankVote?: { $ref?: string };
            };
          }
        | undefined;
      expect(responseSchema).toBeDefined();
      expect(responseSchema!.properties!.election).toMatchObject({
        $ref: '#/components/schemas/BallotElectionDto',
      });
      expect(responseSchema!.properties!.candidacies).toMatchObject({
        type: 'array',
        items: { $ref: '#/components/schemas/CandidacyWithCandidateResponseDto' },
      });
      expect(responseSchema!.properties!.blankVote).toMatchObject({
        $ref: '#/components/schemas/BlankVoteDto',
      });
      const blankVoteSchema = document.components?.schemas?.['BlankVoteDto'] as
        | { properties?: { id?: { type?: string }; enabled?: { type?: string } } }
        | undefined;
      expect(blankVoteSchema).toBeDefined();
      expect(blankVoteSchema!.properties!.id).toMatchObject({ type: 'string' });
      expect(blankVoteSchema!.properties!.enabled).toMatchObject({ type: 'boolean' });
      const electionSchema = document.components?.schemas?.['BallotElectionDto'] as
        | { properties?: { id?: unknown; name?: unknown } }
        | undefined;
      expect(electionSchema).toBeDefined();
      expect(electionSchema!.properties).toBeDefined();

      // SW7: the relevant error responses are documented.
      expect(operation.responses?.['400']).toBeDefined();
      expect(operation.responses?.['401']).toBeDefined();
      expect(operation.responses?.['403']).toBeDefined();
      expect(operation.responses?.['404']).toBeDefined();
      expect(operation.responses?.['409']).toBeDefined();

      // SW8: the operation summary is present.
      expect(operation.summary).toBeTruthy();
    });
  });
});
