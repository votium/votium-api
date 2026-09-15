import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types';
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

interface TokensResponseBody {
  accessToken: string;
}

interface SwaggerOperationShape {
  tags?: string[];
  parameters?: Array<{ name: string; in: string; required: boolean }>;
  security?: Array<{ bearer: string[] }>;
  responses: Record<string, { content?: Record<string, { schema: { $ref?: string } }> }>;
}

type SeedStatus = 'CREATED' | 'PENDING' | 'PUBLISHED' | 'ACTIVE' | 'CLOSED';

describe('Manual election start (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let emailService: FakeEmailService;

  let adminUser: { id: string; email: string; password: string };
  let auditorUser: { id: string; email: string; password: string };
  let adminToken = '';
  let auditorToken = '';

  const suffix = Date.now();
  let electionCounter = 0;

  const usedElectionIds: string[] = [];
  const usedCandidateIds: string[] = [];
  const usedElectorIds: string[] = [];
  const usedUserIds: string[] = [];

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * 86_400_000);
  const nextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  const timeAt = (hh: number, mm = 0, ss = 0): Date => new Date(Date.UTC(1970, 0, 1, hh, mm, ss));

  const completeLogin = async (email: string, password: string): Promise<string> => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);
    const sessionId = (loginRes.body as { sessionId: string }).sessionId;
    const code = emailService.last().code;
    const verifyRes = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/verify')
      .send({ sessionId, code })
      .expect(201);
    return (verifyRes.body as TokensResponseBody).accessToken;
  };

  const startRequest = (id: string, body: Record<string, unknown> | undefined, token?: string) => {
    const req = request(app.getHttpServer()).post(`/api/v1/elections/${id}/start`);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return body !== undefined ? req.send(body) : req.send();
  };

  const historyFor = async (electionId: string) =>
    prisma.electionStatusHistory.findMany({
      where: { election_id: electionId },
      orderBy: { changed_at: 'asc' },
    });

  type ElectionSeedOverrides = {
    status?: SeedStatus;
    startDate?: Date;
    startTime?: Date;
    endDate?: Date;
    endTime?: Date;
  };

  // Seeds directly via Prisma (bypassing the API) so dates can be relative to "now".
  // Default seed is PENDING with a wide schedule-active window: yesterday 00:00 →
  // tomorrow 23:59:59 (UTC), so it is eligible whenever `now` is.
  async function seedElection(over: ElectionSeedOverrides = {}): Promise<string> {
    const name = `E2E-START-${suffix}-${electionCounter++}`;
    const created = await prisma.election.create({
      data: {
        name,
        description: 'E2E manual start election.',
        start_date: over.startDate ?? addDays(today, -1),
        start_time: over.startTime ?? timeAt(0, 0, 0),
        end_date: over.endDate ?? addDays(today, 1),
        end_time: over.endTime ?? timeAt(23, 59, 59),
        current_status: over.status ?? 'PENDING',
        blank_vote_enabled: false,
      },
    });
    usedElectionIds.push(created.id);
    return created.id;
  }

  async function seedElectorAndRoll(electionId: string): Promise<void> {
    const elector = await prisma.elector.create({
      data: {
        first_name: 'E2E',
        last_name: 'Elector',
        email: `e2e-start-elector-${suffix}-${Math.random()}@example.com`,
        password_hash: 'pbkdf2$placeholder',
        student_code: `E2E-START-EL-${suffix}-${Math.random()}`,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    usedElectorIds.push(elector.id);
    await prisma.electoralRoll.create({
      data: { election_id: electionId, elector_id: elector.id },
    });
  }

  async function seedCandidateAndCandidacy(electionId: string): Promise<void> {
    const candidate = await prisma.candidate.create({
      data: {
        first_name: 'E2E',
        last_name: 'Candidate',
        student_code: `E2E-START-CAND-${suffix}-${Math.random()}`,
        program_code: 'PC',
        identification_number: `E2E-START-ID-${suffix}-${Math.random()}`,
        status: 'ACTIVE',
      },
    });
    usedCandidateIds.push(candidate.id);
    await prisma.candiday.create({
      data: { candidate_id: candidate.id, election_id: electionId, position_number: 1 },
    });
  }

  async function seedEligibleElection(): Promise<string> {
    const id = await seedElection();
    await seedElectorAndRoll(id);
    await seedCandidateAndCandidacy(id);
    return id;
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
      email: `e2e-start-admin-${suffix}@example.com`,
      password: 'SuperSecret123!',
    };
    auditorUser = {
      id: '',
      email: `e2e-start-auditor-${suffix}@example.com`,
      password: 'SuperSecret123!',
    };

    const createdAdmin = await prisma.user.create({
      data: {
        first_name: 'E2E',
        last_name: 'Admin',
        email: adminUser.email,
        password_hash: await hasher.hash(adminUser.password),
        role_id: adminRole.id,
        status: UserStatus.ACTIVE.value,
      },
    });
    const createdAuditor = await prisma.user.create({
      data: {
        first_name: 'E2E',
        last_name: 'Auditor',
        email: auditorUser.email,
        password_hash: await hasher.hash(auditorUser.password),
        role_id: auditorRole.id,
        status: UserStatus.ACTIVE.value,
      },
    });
    adminUser.id = createdAdmin.id;
    auditorUser.id = createdAuditor.id;
    usedUserIds.push(adminUser.id, auditorUser.id);

    adminToken = await completeLogin(adminUser.email, adminUser.password);
    auditorToken = await completeLogin(auditorUser.email, auditorUser.password);
  });

  afterAll(async () => {
    if (usedElectionIds.length > 0) {
      await prisma.electionStatusHistory.deleteMany({
        where: { election_id: { in: usedElectionIds } },
      });
      await prisma.electoralRoll.deleteMany({
        where: { election_id: { in: usedElectionIds } },
      });
      await prisma.candiday.deleteMany({
        where: { election_id: { in: usedElectionIds } },
      });
      await prisma.election.deleteMany({ where: { id: { in: usedElectionIds } } });
    }
    if (usedCandidateIds.length > 0) {
      await prisma.candidate.deleteMany({ where: { id: { in: usedCandidateIds } } });
    }
    if (usedElectorIds.length > 0) {
      await prisma.elector.deleteMany({ where: { id: { in: usedElectorIds } } });
    }
    if (usedUserIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { user_id: { in: usedUserIds } } });
      await prisma.mfaChallenge.deleteMany({ where: { user_id: { in: usedUserIds } } });
      await prisma.electionStatusHistory.deleteMany({
        where: { user_id: { in: usedUserIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: usedUserIds } } });
    }
    await app.close();
  });

  describe('Successful start & persistence', () => {
    it('START-1: an eligible PENDING election starts with 200 and the ElectionResponseDto contract', async () => {
      const id = await seedEligibleElection();

      const res = await startRequest(id, undefined, adminToken).expect(200);
      const body = res.body as Record<string, unknown>;

      expect(body.id).toBe(id);
      expect(body.currentStatus).toBe('ACTIVE');
      expect(Object.keys(body).sort()).toEqual(
        [
          'id',
          'name',
          'description',
          'startDate',
          'startTime',
          'endDate',
          'endTime',
          'currentStatus',
          'blankVoteEnabled',
          'createdAt',
        ].sort(),
      );
    });

    it('START-2: the database row is ACTIVE and one PENDING→ACTIVE history row is recorded', async () => {
      const id = await seedEligibleElection();

      await startRequest(id, undefined, adminToken).expect(200);

      const row = await prisma.election.findUnique({ where: { id } });
      expect(row!.current_status).toBe('ACTIVE');

      const history = await historyFor(id);
      expect(history).toHaveLength(1);
      expect(history[0].old_status).toBe('PENDING');
      expect(history[0].new_status).toBe('ACTIVE');
      expect(history[0].user_id).toBe(adminUser.id);
    });
  });

  describe('Authentication & authorization', () => {
    it('START-3: an unauthenticated request is rejected with 401', async () => {
      const id = await seedEligibleElection();

      await startRequest(id, undefined).expect(401);
    });

    it('START-4: an invalid token is rejected with 401', async () => {
      const id = await seedEligibleElection();

      await startRequest(id, undefined, 'not-a-real-token').expect(401);
    });

    it('START-5: an auditor is rejected with 403 and the election stays PENDING', async () => {
      const id = await seedEligibleElection();

      const res = await startRequest(id, undefined, auditorToken).expect(403);
      expect(res.body).toMatchObject({ statusCode: 403 });
      expect((await prisma.election.findUnique({ where: { id } }))!.current_status).toBe('PENDING');
    });
  });

  describe('Input & existence', () => {
    it('START-6: a non-UUID id is rejected with 400', async () => {
      const res = await startRequest('not-a-uuid', undefined, adminToken).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('START-7: an unknown UUID is rejected with 404 and writes nothing', async () => {
      const res = await startRequest(
        '00000000-0000-0000-0000-000000000000',
        undefined,
        adminToken,
      ).expect(404);
      expect(res.body).toMatchObject({ statusCode: 404, error: 'ELECTION_NOT_FOUND' });

      const history = await historyFor('00000000-0000-0000-0000-000000000000');
      expect(history).toHaveLength(0);
    });
  });

  describe('Business rules', () => {
    it('START-8: non-PENDING elections are rejected with 409 and the row is unchanged', async () => {
      const statuses: SeedStatus[] = ['CREATED', 'PUBLISHED', 'CLOSED', 'ACTIVE'];
      for (const status of statuses) {
        const id = await seedElection({ status });

        const res = await startRequest(id, undefined, adminToken).expect(409);
        expect(res.body).toMatchObject({
          statusCode: 409,
          error: 'ELECTION_STATUS_TRANSITION_INVALID',
        });
        expect((await prisma.election.findUnique({ where: { id } }))!.current_status).toBe(status);
      }
    });

    it('START-9: a PENDING election without an electoral roll is rejected with 409', async () => {
      const id = await seedElection();
      await seedCandidateAndCandidacy(id);

      const res = await startRequest(id, undefined, adminToken).expect(409);
      expect(res.body).toMatchObject({
        statusCode: 409,
        error: 'ELECTION_MISSING_ELECTORAL_ROLL',
      });
      expect((await prisma.election.findUnique({ where: { id } }))!.current_status).toBe('PENDING');
    });

    it('START-10: a PENDING election without a registered candidacy is rejected with 409', async () => {
      const id = await seedElection();
      await seedElectorAndRoll(id);

      const res = await startRequest(id, undefined, adminToken).expect(409);
      expect(res.body).toMatchObject({
        statusCode: 409,
        error: 'ELECTION_NO_CANDIDATES',
      });
      expect((await prisma.election.findUnique({ where: { id } }))!.current_status).toBe('PENDING');
    });

    it('START-11: a PENDING election outside its schedule window is rejected with 422', async () => {
      const id = await seedElection({
        startDate: addDays(nextMonth, 15),
        startTime: timeAt(8, 0, 0),
        endDate: addDays(nextMonth, 30),
        endTime: timeAt(18, 0, 0),
      });
      await seedElectorAndRoll(id);
      await seedCandidateAndCandidacy(id);

      const res = await startRequest(id, undefined, adminToken).expect(422);
      expect(res.body).toMatchObject({
        statusCode: 422,
        error: 'ELECTION_NOT_WITHIN_SCHEDULE',
      });
      expect((await prisma.election.findUnique({ where: { id } }))!.current_status).toBe('PENDING');
    });

    it('START-12: no failed attempt writes a status or history row (no partial writes)', async () => {
      const failedIds: string[] = [];

      const noRoll = await seedElection();
      failedIds.push(noRoll);
      await seedCandidateAndCandidacy(noRoll);

      const noCandidates = await seedElection();
      failedIds.push(noCandidates);
      await seedElectorAndRoll(noCandidates);

      const outOfWindow = await seedElection({
        startDate: addDays(nextMonth, 15),
        startTime: timeAt(8, 0, 0),
        endDate: addDays(nextMonth, 30),
        endTime: timeAt(18, 0, 0),
      });
      failedIds.push(outOfWindow);
      await seedElectorAndRoll(outOfWindow);
      await seedCandidateAndCandidacy(outOfWindow);

      const published = await seedElection({ status: 'PUBLISHED' });
      failedIds.push(published);

      await startRequest(noRoll, undefined, adminToken).expect(409);
      await startRequest(noCandidates, undefined, adminToken).expect(409);
      await startRequest(outOfWindow, undefined, adminToken).expect(422);
      await startRequest(published, undefined, adminToken).expect(409);

      for (const id of failedIds) {
        const row = await prisma.election.findUnique({ where: { id } });
        const history = await historyFor(id);
        expect(history).toHaveLength(0);
        if (id === published) {
          expect(row!.current_status).toBe('PUBLISHED');
        } else {
          expect(row!.current_status).toBe('PENDING');
        }
      }
    });
  });

  describe('Repeated start & body contract', () => {
    it('START-13: starting an already started election is rejected with 409 and stays ACTIVE', async () => {
      const id = await seedEligibleElection();
      await startRequest(id, undefined, adminToken).expect(200);

      const res = await startRequest(id, undefined, adminToken).expect(409);
      expect(res.body).toMatchObject({
        statusCode: 409,
        error: 'ELECTION_STATUS_TRANSITION_INVALID',
      });

      const row = await prisma.election.findUnique({ where: { id } });
      expect(row!.current_status).toBe('ACTIVE');
      const history = await historyFor(id);
      expect(history).toHaveLength(1);
      expect(history[0].old_status).toBe('PENDING');
      expect(history[0].new_status).toBe('ACTIVE');
    });

    it('START-14: the endpoint has no body contract — an extraneous body is ignored', async () => {
      const id = await seedEligibleElection();

      // The route declares no @Body(); a stray payload must not influence the
      // response (and must not be validated). The start still succeeds with 200.
      const res = await startRequest(id, { foo: 1 }, adminToken).expect(200);
      expect(res.body).toMatchObject({ id, currentStatus: 'ACTIVE' });
    });
  });

  describe('Swagger / OpenAPI', () => {
    it('SWAGGER-1: the generated OpenAPI document documents the start endpoint', () => {
      const config = new DocumentBuilder()
        .setTitle('Votium API')
        .setDescription('Electronic voting system API')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
      const document = SwaggerModule.createDocument(app, config);

      // The path exists and the post operation is defined.
      const pathKey = Object.keys(document.paths).find((p) => p.endsWith('/elections/{id}/start'));
      expect(pathKey).toBeDefined();
      const operation = document.paths[pathKey!].post as unknown as SwaggerOperationShape;
      expect(operation).toBeDefined();

      // The operation is grouped under the elections tag.
      expect(operation.tags).toContain('elections');

      // The election identifier path parameter is documented.
      expect(operation.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'id',
            in: 'path',
            required: true,
          }),
        ]),
      );

      // Authentication is documented at the operation level.
      expect(operation.security).toEqual([{ bearer: [] }]);
      expect(document.components?.securitySchemes?.bearer).toBeDefined();

      // The successful response schema is the ElectionResponseDto component.
      const success = operation.responses['200'];
      expect(success).toBeDefined();
      const schemaRef = success.content!['application/json'].schema.$ref;
      expect(schemaRef).toBe('#/components/schemas/ElectionResponseDto');
      const responseSchema = document.components?.schemas?.['ElectionResponseDto'] as
        | { properties?: { currentStatus?: unknown } }
        | undefined;
      expect(responseSchema).toBeDefined();
      expect(responseSchema!.properties?.currentStatus).toBeDefined();

      // The relevant error responses are documented.
      expect(operation.responses['400']).toBeDefined();
      expect(operation.responses['401']).toBeDefined();
      expect(operation.responses['403']).toBeDefined();
      expect(operation.responses['404']).toBeDefined();
      expect(operation.responses['409']).toBeDefined();
      expect(operation.responses['422']).toBeDefined();
    });
  });
});
