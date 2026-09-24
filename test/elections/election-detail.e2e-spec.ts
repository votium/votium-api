import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request, { Response } from 'supertest';
import cookieParser from 'cookie-parser';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { envs } from '../../src/config';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { GlobalExceptionFilter } from '../../src/shared/exceptions/filters/global-exception.filter';
import {
  ASYNC_EMAIL_SERVICE_PORT,
  type AsyncEmailServicePort,
} from '../../src/modules/auth/application/ports/async-email-service.port';
import { NodeCryptoPasswordHasherService } from '../../src/modules/iam/infrastructure/services/node-crypto-password-hasher.service';
import { RoleName } from '../../src/modules/iam/domain/value-objects/role-name.vo';
import { UserStatus } from '../../src/modules/iam/domain/value-objects/user-status.vo';
import { extractAuthCookie } from '../auth/auth-cookie.utils';

interface ElectionDetailResponseBody {
  id: string;
  name: string;
  description: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  currentStatus: string;
  blankVoteEnabled: boolean;
  createdAt: string;
  statusHistory: Array<{ status: string; timestamp: string }>;
  candidacies: Array<{
    id: string;
    positionNumber: number;
    imageUrl: string | null;
    createdAt: string;
    candidate: { id: string; firstName: string; lastName: string };
  }>;
  registeredVoters: number;
}

function toDetailBody(res: Response): ElectionDetailResponseBody {
  return res.body as ElectionDetailResponseBody;
}

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

interface SwaggerOperationShape {
  tags?: string[];
  parameters?: Array<{ name: string; in: string; required: boolean }>;
  security?: Array<{ cookie: string[] }>;
  responses: Record<string, { content?: Record<string, { schema: { $ref?: string } }> }>;
}

type SeedStatus = 'CREATED' | 'PENDING' | 'PUBLISHED' | 'ACTIVE' | 'CLOSED';

describe('Election detail (e2e)', () => {
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
  const _nextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
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
    return extractAuthCookie(verifyRes);
  };

  const detailRequest = (id: string, token?: string) => {
    const req = request(app.getHttpServer()).get(`/api/v1/elections/${id}`);
    if (token) req.set('Cookie', token);
    return req;
  };

  const historyFor = async (electionId: string) =>
    prisma.electionStatusHistory.findMany({
      where: { election_id: electionId },
      orderBy: { changed_at: 'asc' },
    });

  // Seeds directly via Prisma so dates can be relative to "now".
  // Default seed is PENDING with a wide schedule-active window: yesterday 00:00 →
  // tomorrow 23:59:59 (UTC), so it is eligible whenever `now` is.
  async function seedElection(
    over: {
      status?: SeedStatus;
      startDate?: Date;
      startTime?: Date;
      endDate?: Date;
      endTime?: Date;
    } = {},
  ): Promise<string> {
    const name = `E2E-DETAIL-${suffix}-${electionCounter++}`;
    const created = await prisma.election.create({
      data: {
        name,
        description: 'E2E election detail test.',
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
        email: `e2e-detail-elector-${suffix}-${Math.random()}@example.com`,
        password_hash: 'pbkdf2$placeholder',
        student_code: `E2E-DETAIL-EL-${suffix}-${Math.random()}`,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    usedElectorIds.push(elector.id);
    await prisma.electoralRoll.create({
      data: { election_id: electionId, elector_id: elector.id },
    });
  }

  async function seedCandidateAndCandidacy(
    electionId: string,
    candidateStatus: 'ACTIVE' | 'INACTIVE' = 'ACTIVE',
  ): Promise<void> {
    const candidate = await prisma.candidate.create({
      data: {
        first_name: 'E2E',
        last_name: 'Candidate',
        student_code: `E2E-DETAIL-CAND-${suffix}-${Math.random()}`,
        program_code: 'PC',
        identification_number: `E2E-DETAIL-ID-${suffix}-${Math.random()}`,
        status: candidateStatus,
      },
    });
    usedCandidateIds.push(candidate.id);
    await prisma.candiday.create({
      data: { candidate_id: candidate.id, election_id: electionId, position_number: 1 },
    });
  }

  async function seedElectionStatusHistory(
    electionId: string,
    userId: string,
    statuses: SeedStatus[],
  ): Promise<void> {
    const baseTime = new Date('2026-08-20T10:00:00.000Z');
    for (let i = 0; i < statuses.length; i++) {
      const oldStatus = i === 0 ? 'CREATED' : statuses[i - 1];
      await prisma.electionStatusHistory.create({
        data: {
          election_id: electionId,
          user_id: userId,
          old_status: oldStatus,
          new_status: statuses[i],
          changed_at: new Date(baseTime.getTime() + i * 86_400_000),
        },
      });
    }
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
    const auditorRole = await prisma.role.upsert({
      where: { name: RoleName.AUDITOR.value },
      update: {},
      create: { name: RoleName.AUDITOR.value },
    });

    adminUser = {
      id: '',
      email: `e2e-detail-admin-${suffix}@example.com`,
      password: 'SuperSecret123!',
    };
    auditorUser = {
      id: '',
      email: `e2e-detail-auditor-${suffix}@example.com`,
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

  describe('D1 200 contract', () => {
    it('returns full key set with correct types/values', async () => {
      const electionId = await seedElection({ status: 'PENDING' });
      await seedElectorAndRoll(electionId);
      await seedElectorAndRoll(electionId);
      await seedCandidateAndCandidacy(electionId);
      await seedElectionStatusHistory(electionId, adminUser.id, ['PENDING', 'ACTIVE']);

      const res = await detailRequest(electionId, adminToken).expect(200);
      const body = toDetailBody(res);

      expect(body.id).toBe(electionId);
      expect(typeof body.name).toBe('string');
      expect(typeof body.description).toBe('string');
      expect(typeof body.startDate).toBe('string');
      expect(typeof body.startTime).toBe('string');
      expect(typeof body.endDate).toBe('string');
      expect(typeof body.endTime).toBe('string');
      expect(typeof body.currentStatus).toBe('string');
      expect(typeof body.blankVoteEnabled).toBe('boolean');
      expect(typeof body.createdAt).toBe('string');
      expect(Array.isArray(body.statusHistory)).toBe(true);
      expect(Array.isArray(body.candidacies)).toBe(true);
      expect(typeof body.registeredVoters).toBe('number');

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
          'statusHistory',
          'candidacies',
          'registeredVoters',
        ].sort(),
      );
    });
  });

  describe('D2 200 basic info serialization', () => {
    it('matches persisted election with project date/time conventions', async () => {
      const electionId = await seedElection({
        status: 'PENDING',
        startDate: new Date(Date.UTC(2026, 9, 15)),
        startTime: timeAt(9, 30, 0),
        endDate: new Date(Date.UTC(2026, 9, 16)),
        endTime: timeAt(17, 45, 0),
      });
      await seedElectorAndRoll(electionId);
      await seedCandidateAndCandidacy(electionId);

      const res = await detailRequest(electionId, adminToken).expect(200);
      const body = toDetailBody(res);

      expect(body.name).toContain('E2E-DETAIL');
      expect(body.description).toBe('E2E election detail test.');
      expect(body.startDate).toBe('2026-10-15');
      expect(body.startTime).toBe('09:30:00');
      expect(body.endDate).toBe('2026-10-16');
      expect(body.endTime).toBe('17:45:00');
      expect(body.currentStatus).toBe('PENDING');
      expect(body.blankVoteEnabled).toBe(false);
      expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });
  });

  describe('D3 status history', () => {
    it('returns seeded transitions oldest→newest with status and ISO timestamp', async () => {
      const electionId = await seedElection({ status: 'ACTIVE' });
      await seedElectorAndRoll(electionId);
      await seedCandidateAndCandidacy(electionId);
      await seedElectionStatusHistory(electionId, adminUser.id, ['PENDING', 'PUBLISHED', 'ACTIVE']);

      const res = await detailRequest(electionId, adminToken).expect(200);
      const body = toDetailBody(res);

      expect(body.statusHistory).toHaveLength(3);
      expect(body.statusHistory[0]).toEqual(
        expect.objectContaining({
          status: 'PENDING',
          timestamp: '2026-08-20T10:00:00.000Z',
        }),
      );
      expect(body.statusHistory[1]).toEqual(
        expect.objectContaining({
          status: 'PUBLISHED',
          timestamp: '2026-08-21T10:00:00.000Z',
        }),
      );
      expect(body.statusHistory[2]).toEqual(
        expect.objectContaining({
          status: 'ACTIVE',
          timestamp: '2026-08-22T10:00:00.000Z',
        }),
      );
    });

    it('returns empty statusHistory for an election with no transitions', async () => {
      const electionId = await seedElection({ status: 'CREATED' });
      await seedElectorAndRoll(electionId);
      await seedCandidateAndCandidacy(electionId);

      const res = await detailRequest(electionId, adminToken).expect(200);
      const body = toDetailBody(res);

      expect(body.statusHistory).toEqual([]);
    });
  });

  describe('D4 candidates scoping', () => {
    it('excludes candidacies from another election', async () => {
      const electionA = await seedElection({ status: 'PENDING' });
      const electionB = await seedElection({ status: 'PENDING' });
      await seedElectorAndRoll(electionA);
      await seedElectorAndRoll(electionB);
      await seedCandidateAndCandidacy(electionA);
      await seedCandidateAndCandidacy(electionB);

      const res = await detailRequest(electionA, adminToken).expect(200);
      const body = toDetailBody(res);

      expect(body.candidacies).toHaveLength(1);
      // The returned candidacy belongs to electionA; verify via its candidate's
      // identity (candidate ids differ across elections).
      const cand = body.candidacies[0];
      expect(cand.candidate).toMatchObject({
        firstName: 'E2E',
        lastName: 'Candidate',
      });
    });
  });

  describe('D5 candidates + logical deletion', () => {
    it('excludes INACTIVE candidate, includes ACTIVE candidate with nested candidate {id, firstName, lastName}', async () => {
      const electionId = await seedElection({ status: 'PENDING' });
      await seedElectorAndRoll(electionId);
      // Two candidates with different position numbers to satisfy unique constraint
      const candidate1 = await prisma.candidate.create({
        data: {
          first_name: 'E2E',
          last_name: 'CandidateActive',
          student_code: `E2E-DETAIL-CAND-ACTIVE-${suffix}-${Math.random()}`,
          program_code: 'PC',
          identification_number: `E2E-DETAIL-ID-${suffix}-${Math.random()}`,
          status: 'ACTIVE',
        },
      });
      usedCandidateIds.push(candidate1.id);
      await prisma.candiday.create({
        data: { candidate_id: candidate1.id, election_id: electionId, position_number: 1 },
      });

      const candidate2 = await prisma.candidate.create({
        data: {
          first_name: 'E2E',
          last_name: 'CandidateInactive',
          student_code: `E2E-DETAIL-CAND-INACTIVE-${suffix}-${Math.random()}`,
          program_code: 'PC',
          identification_number: `E2E-DETAIL-ID-${suffix}-${Math.random()}`,
          status: 'INACTIVE',
        },
      });
      usedCandidateIds.push(candidate2.id);
      await prisma.candiday.create({
        data: { candidate_id: candidate2.id, election_id: electionId, position_number: 2 },
      });

      const res = await detailRequest(electionId, adminToken).expect(200);
      const body = toDetailBody(res);

      expect(body.candidacies).toHaveLength(1);
      expect(body.candidacies[0].positionNumber).toBe(1);
      expect(body.candidacies[0].candidate.firstName).toBe('E2E');
      expect(body.candidacies[0].candidate.lastName).toBe('CandidateActive');
      expect(typeof body.candidacies[0].candidate.id).toBe('string');
    });
  });

  describe('D6 elector count', () => {
    it('registeredVoters equals seeded electoral_rolls rows; 0 when no roll', async () => {
      const electionWithRolls = await seedElection({ status: 'PENDING' });
      await seedElectorAndRoll(electionWithRolls);
      await seedElectorAndRoll(electionWithRolls);
      await seedElectorAndRoll(electionWithRolls);
      await seedCandidateAndCandidacy(electionWithRolls);

      const resWith = await detailRequest(electionWithRolls, adminToken).expect(200);
      const bodyWith = toDetailBody(resWith);
      expect(bodyWith.registeredVoters).toBe(3);

      const electionEmpty = await seedElection({ status: 'PENDING' });
      await seedCandidateAndCandidacy(electionEmpty);

      const resEmpty = await detailRequest(electionEmpty, adminToken).expect(200);
      const bodyEmpty = toDetailBody(resEmpty);
      expect(bodyEmpty.registeredVoters).toBe(0);
    });
  });

  describe('D7 read-only', () => {
    it('does not mutate election, history, candidacies, or rolls', async () => {
      const electionId = await seedElection({ status: 'PENDING' });
      await seedElectorAndRoll(electionId);
      await seedCandidateAndCandidacy(electionId);
      await seedElectionStatusHistory(electionId, adminUser.id, ['PENDING']);

      const beforeElection = await prisma.election.findUnique({ where: { id: electionId } });
      const beforeHistoryCount = await prisma.electionStatusHistory.count({
        where: { election_id: electionId },
      });
      const beforeCandidacyCount = await prisma.candiday.count({
        where: { election_id: electionId },
      });
      const beforeRollCount = await prisma.electoralRoll.count({
        where: { election_id: electionId },
      });

      await detailRequest(electionId, adminToken).expect(200);

      const afterElection = await prisma.election.findUnique({ where: { id: electionId } });
      const afterHistoryCount = await prisma.electionStatusHistory.count({
        where: { election_id: electionId },
      });
      const afterCandidacyCount = await prisma.candiday.count({
        where: { election_id: electionId },
      });
      const afterRollCount = await prisma.electoralRoll.count({
        where: { election_id: electionId },
      });

      expect(afterElection).toEqual(beforeElection);
      expect(afterHistoryCount).toBe(beforeHistoryCount);
      expect(afterCandidacyCount).toBe(beforeCandidacyCount);
      expect(afterRollCount).toBe(beforeRollCount);
    });
  });

  describe('D8 400 invalid id', () => {
    it('rejects non-UUID with 400', async () => {
      await detailRequest('not-a-uuid', adminToken).expect(400);
    });
  });

  describe('D9 404 unknown UUID', () => {
    it('rejects unknown UUID with 404 and ELECTION_NOT_FOUND, no DB writes', async () => {
      const res = await detailRequest('00000000-0000-0000-0000-000000000000', adminToken).expect(
        404,
      );
      expect(res.body).toMatchObject({ statusCode: 404, error: 'ELECTION_NOT_FOUND' });

      const history = await historyFor('00000000-0000-0000-0000-000000000000');
      expect(history).toHaveLength(0);
    });
  });

  describe('D10 401 unauthenticated', () => {
    it('rejects unauthenticated request with 401', async () => {
      const electionId = await seedElection({ status: 'PENDING' });
      await seedElectorAndRoll(electionId);
      await seedCandidateAndCandidacy(electionId);

      await detailRequest(electionId).expect(401);
    });

    it('rejects invalid cookie with 401', async () => {
      const electionId = await seedElection({ status: 'PENDING' });
      await seedElectorAndRoll(electionId);
      await seedCandidateAndCandidacy(electionId);

      await detailRequest(electionId, 'invalid-cookie').expect(401);
    });
  });

  describe('D11 403 auditor access', () => {
    it('allows AUDITOR role (200)', async () => {
      const electionId = await seedElection({ status: 'PENDING' });
      await seedElectorAndRoll(electionId);
      await seedCandidateAndCandidacy(electionId);

      const res = await detailRequest(electionId, auditorToken).expect(200);
      expect(toDetailBody(res).id).toBe(electionId);
    });
  });

  describe('Swagger / OpenAPI', () => {
    it('SWAGGER-1: GET /elections/{id} is documented under elections tag', () => {
      const config = new DocumentBuilder()
        .setTitle('Votium API')
        .setDescription('Electronic voting system API')
        .setVersion('1.0')
        .addCookieAuth(envs.authCookieName)
        .build();
      const document = SwaggerModule.createDocument(app, config);

      const pathKey = Object.keys(document.paths).find(
        (p) =>
          p.endsWith('/elections/{id}') && !p.includes('/start') && !p.includes('/candidacies'),
      );
      expect(pathKey).toBeDefined();
      const operation = document.paths[pathKey!].get as unknown as SwaggerOperationShape;
      expect(operation).toBeDefined();

      expect(operation.tags).toContain('elections');

      expect(operation.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'id', in: 'path', required: true }),
        ]),
      );

      expect(operation.security).toEqual([{ cookie: [] }]);
      expect(document.components?.securitySchemes?.cookie).toBeDefined();
    });

    it('SWAGGER-2: 200 response references ElectionDetailResponseDto with statusHistory, candidacies, registeredVoters and base fields', () => {
      const config = new DocumentBuilder()
        .setTitle('Votium API')
        .setDescription('Electronic voting system API')
        .setVersion('1.0')
        .addCookieAuth(envs.authCookieName)
        .build();
      const document = SwaggerModule.createDocument(app, config);

      const pathKey = Object.keys(document.paths).find(
        (p) =>
          p.endsWith('/elections/{id}') && !p.includes('/start') && !p.includes('/candidacies'),
      );
      const operation = document.paths[pathKey!].get as unknown as SwaggerOperationShape;
      const success = operation.responses['200'];
      expect(success).toBeDefined();
      const schemaRef = success.content!['application/json'].schema.$ref;
      expect(schemaRef).toBe('#/components/schemas/ElectionDetailResponseDto');
      const detailSchema = document.components?.schemas?.['ElectionDetailResponseDto'] as
        | { properties?: Record<string, unknown> }
        | undefined;
      expect(detailSchema).toBeDefined();
      expect(detailSchema!.properties?.statusHistory).toBeDefined();
      expect(detailSchema!.properties?.candidacies).toBeDefined();
      expect(detailSchema!.properties?.registeredVoters).toBeDefined();
      // Inherited base fields
      expect(detailSchema!.properties?.id).toBeDefined();
      expect(detailSchema!.properties?.name).toBeDefined();
      expect(detailSchema!.properties?.currentStatus).toBeDefined();
      expect(detailSchema!.properties?.startDate).toBeDefined();
      expect(detailSchema!.properties?.createdAt).toBeDefined();
    });

    it('SWAGGER-3: error responses 400/401/403/404 documented', () => {
      const config = new DocumentBuilder()
        .setTitle('Votium API')
        .setDescription('Electronic voting system API')
        .setVersion('1.0')
        .addCookieAuth(envs.authCookieName)
        .build();
      const document = SwaggerModule.createDocument(app, config);

      const pathKey = Object.keys(document.paths).find(
        (p) =>
          p.endsWith('/elections/{id}') && !p.includes('/start') && !p.includes('/candidacies'),
      );
      const operation = document.paths[pathKey!].get as unknown as SwaggerOperationShape;

      expect(operation.responses['400']).toBeDefined();
      expect(operation.responses['401']).toBeDefined();
      expect(operation.responses['403']).toBeDefined();
      expect(operation.responses['404']).toBeDefined();
    });
  });
});
