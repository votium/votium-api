import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types';
import * as jwt from 'jsonwebtoken';
import { envs } from '../../src/config';
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
  expiresIn: number;
}

interface LoginResponseBody {
  mfaRequired: boolean;
  sessionId: string;
  expiresIn: number;
  message: string;
}

interface SummaryResponse {
  electionName: string;
  registeredVoters: number;
}

interface SwaggerOperationShape {
  tags?: string[];
  parameters?: Array<{ name: string; in: string; required: boolean }>;
  security?: Array<{ bearer: string[] }>;
  responses: Record<string, { content: Record<string, { schema: { $ref?: string } }> }>;
}

describe('Electoral roll summary (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let emailService: FakeEmailService;

  let adminUser: { id: string; email: string; password: string };
  let auditorUser: { id: string; email: string; password: string };
  let electorUser: { id: string; email: string; password: string };
  let adminToken = '';
  let auditorToken = '';
  let electorToken = '';

  const suffix = Date.now();
  let electionCounter = 0;

  const usedElectionIds: string[] = [];
  const usedStudentCodes: string[] = [];
  const usedUserIds: string[] = [];

  const codeA = `SUMMARY-A-${suffix}`;
  const codeB = `SUMMARY-B-${suffix}`;
  const codeC = `SUMMARY-C-${suffix}`;

  const electorIds: Record<string, string> = {};

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

  const completeElectorLogin = async (email: string, password: string): Promise<string> => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/electors/auth/login')
      .send({ email, password })
      .expect(200);
    const sessionId = (loginRes.body as LoginResponseBody).sessionId;
    const code = emailService.last().code;
    const verifyRes = await request(app.getHttpServer())
      .post('/api/v1/electors/auth/mfa/verify')
      .send({ sessionId, code })
      .expect(201);
    return (verifyRes.body as TokensResponseBody).accessToken;
  };

  const getSummary = (electionId: string, token?: string) => {
    const req = request(app.getHttpServer()).get(`/api/v1/electoral-rolls/${electionId}`);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req;
  };

  const seedElection = async (): Promise<string> => {
    const name = `E2E-SUMMARY-${suffix}-${electionCounter++}`;
    const created = await prisma.election.create({
      data: {
        name,
        description: 'E2E electoral roll summary election.',
        start_date: new Date(Date.UTC(2026, 9, 1)),
        start_time: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        end_date: new Date(Date.UTC(2026, 9, 1)),
        end_time: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
      },
    });
    usedElectionIds.push(created.id);
    return created.id;
  };

  const seedElector = async (code: string, programCode = '2710') => {
    const created = await prisma.elector.create({
      data: {
        first_name: 'Summary',
        last_name: 'Test',
        email: `${code}-${suffix}@example.com`,
        password_hash: 'pbkdf2$placeholder',
        student_code: code,
        program_code: programCode,
        status: 'ACTIVE',
      },
    });
    usedStudentCodes.push(code);
    electorIds[code] = created.id;
  };

  const createDirectRoll = async (electionId: string, electorId: string) => {
    await prisma.electoralRoll.create({
      data: { election_id: electionId, elector_id: electorId },
    });
  };

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
      email: `e2e-summary-admin-${suffix}@example.com`,
      password: 'SuperSecret123!',
    };
    auditorUser = {
      id: '',
      email: `e2e-summary-auditor-${suffix}@example.com`,
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

    const activeElectorCode = `SUMMARY-ELECTOR-${suffix}`;
    const createdElector = await prisma.elector.create({
      data: {
        first_name: 'E2E',
        last_name: 'Elector',
        email: `e2e-summary-elector-${suffix}@example.com`,
        password_hash: await hasher.hash('SuperSecret123!'),
        student_code: activeElectorCode,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    usedStudentCodes.push(activeElectorCode);
    electorUser = {
      id: createdElector.id,
      email: createdElector.email,
      password: 'SuperSecret123!',
    };

    await seedElector(codeA);
    await seedElector(codeB, '2711');
    await seedElector(codeC);

    adminToken = await completeLogin(adminUser.email, adminUser.password);
    auditorToken = await completeLogin(auditorUser.email, auditorUser.password);
    electorToken = await completeElectorLogin(electorUser.email, electorUser.password);
  });

  afterAll(async () => {
    if (usedElectionIds.length > 0) {
      await prisma.electoralRoll.deleteMany({
        where: { election_id: { in: usedElectionIds } },
      });
      await prisma.election.deleteMany({ where: { id: { in: usedElectionIds } } });
    }
    if (usedStudentCodes.length > 0) {
      await prisma.electorMfaChallenge.deleteMany({
        where: { elector: { student_code: { in: usedStudentCodes } } },
      });
      await prisma.elector.deleteMany({ where: { student_code: { in: usedStudentCodes } } });
    }
    if (usedUserIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { user_id: { in: usedUserIds } } });
      await prisma.mfaChallenge.deleteMany({ where: { user_id: { in: usedUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: usedUserIds } } });
    }
    await app.close();
  });

  describe('Authentication and authorization', () => {
    it('SA1: an authenticated administrator can access the endpoint', async () => {
      const electionId = await seedElection();
      await createDirectRoll(electionId, electorIds[codeA]);

      const res = await getSummary(electionId, adminToken).expect(200);

      const body = res.body as SummaryResponse;
      expect(body.electionName).toEqual(expect.any(String));
      expect(body.registeredVoters).toBe(1);
    });

    it('SA2: an authenticated auditor can access the endpoint with the same contract', async () => {
      const electionId = await seedElection();
      await createDirectRoll(electionId, electorIds[codeA]);

      const res = await getSummary(electionId, auditorToken).expect(200);

      const body = res.body as SummaryResponse;
      expect(body.electionName).toEqual(expect.any(String));
      expect(body.registeredVoters).toBe(1);
    });

    it('SA3: an elector/voter token is rejected with 403', async () => {
      const electionId = await seedElection();

      const res = await getSummary(electionId, electorToken).expect(403);

      expect(res.body).toMatchObject({ statusCode: 403 });
    });

    it('SA4: a missing JWT is rejected with 401', async () => {
      const electionId = await seedElection();

      await getSummary(electionId).expect(401);
    });

    it('SA5: an invalid JWT is rejected with 401', async () => {
      const electionId = await seedElection();

      await getSummary(electionId, 'not-a-token').expect(401);
    });

    it('SA6: an expired JWT is rejected with 401', async () => {
      const electionId = await seedElection();
      const expired = jwt.sign(
        { sub: adminUser.id, email: adminUser.email, actorType: 'USER', role: 'ADMINISTRATOR' },
        envs.jwtSecret,
        { expiresIn: -60 },
      );

      const res = await getSummary(electionId, expired).expect(401);

      expect(res.body).toMatchObject({ statusCode: 401 });
    });

    it('SA7: a USER token with an unauthorized role is rejected with 403', async () => {
      const electionId = await seedElection();
      const unauthorized = jwt.sign(
        { sub: adminUser.id, email: adminUser.email, actorType: 'USER', role: 'SOME_OTHER' },
        envs.jwtSecret,
        { expiresIn: envs.jwtExpiresIn },
      );

      const res = await getSummary(electionId, unauthorized).expect(403);

      expect(res.body).toMatchObject({ statusCode: 403 });
    });

    it('SA8: a client-supplied role header cannot bypass authorization', async () => {
      const electionId = await seedElection();

      const res = await request(app.getHttpServer())
        .get(`/api/v1/electoral-rolls/${electionId}`)
        .set('Authorization', `Bearer ${electorToken}`)
        .set('x-role', 'ADMINISTRATOR')
        .expect(403);

      expect(res.body).toMatchObject({ statusCode: 403 });
    });
  });

  describe('Election resolution', () => {
    it('SE1: an existing election can be queried', async () => {
      const electionId = await seedElection();
      await createDirectRoll(electionId, electorIds[codeA]);

      const res = await getSummary(electionId, adminToken).expect(200);

      expect((res.body as SummaryResponse).registeredVoters).toBe(1);
    });

    it('SE2: a nonexistent election returns the standard not-found response', async () => {
      const res = await getSummary('00000000-0000-4000-8000-000000000000', adminToken).expect(404);

      const body = res.body as SummaryResponse & { statusCode: number; error?: string };
      expect(body).toMatchObject({ statusCode: 404, error: 'ELECTION_NOT_FOUND' });
      expect(body.registeredVoters).toBeUndefined();
    });

    it('SE3: a malformed election identifier returns 400', async () => {
      const res = await getSummary('not-a-uuid', adminToken).expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('SE4: the response contains the persisted election name', async () => {
      const electionId = await seedElection();

      const res = await getSummary(electionId, adminToken).expect(200);

      const persisted = await prisma.election.findUnique({ where: { id: electionId } });
      expect((res.body as SummaryResponse).electionName).toBe(persisted!.name);
    });
  });

  describe('Electoral-roll count', () => {
    it('SC1: an existing election with no registered voters returns 0', async () => {
      const electionId = await seedElection();

      const res = await getSummary(electionId, adminToken).expect(200);

      expect((res.body as SummaryResponse).registeredVoters).toBe(0);
    });

    it('SC2: an election with registered voters returns the correct count', async () => {
      const electionId = await seedElection();
      await createDirectRoll(electionId, electorIds[codeA]);
      await createDirectRoll(electionId, electorIds[codeB]);
      await createDirectRoll(electionId, electorIds[codeC]);

      const res = await getSummary(electionId, adminToken).expect(200);

      expect((res.body as SummaryResponse).registeredVoters).toBe(3);
    });

    it('SC3: voters registered in another election are not included', async () => {
      const electionA = await seedElection();
      const electionB = await seedElection();
      await createDirectRoll(electionA, electorIds[codeA]);
      await createDirectRoll(electionA, electorIds[codeB]);
      await createDirectRoll(electionB, electorIds[codeC]);

      const resA = await getSummary(electionA, adminToken).expect(200);
      const resB = await getSummary(electionB, adminToken).expect(200);

      expect((resA.body as SummaryResponse).registeredVoters).toBe(2);
      expect((resB.body as SummaryResponse).registeredVoters).toBe(1);
    });

    it('SC3b: an elector registered in two elections is counted once per election', async () => {
      const electionA = await seedElection();
      const electionB = await seedElection();
      await createDirectRoll(electionA, electorIds[codeA]);
      await createDirectRoll(electionB, electorIds[codeA]);

      const resA = await getSummary(electionA, adminToken).expect(200);
      const resB = await getSummary(electionB, adminToken).expect(200);

      expect((resA.body as SummaryResponse).registeredVoters).toBe(1);
      expect((resB.body as SummaryResponse).registeredVoters).toBe(1);
    });

    it('SC4: the count reflects the persisted election-elector relationship', async () => {
      const electionId = await seedElection();
      await createDirectRoll(electionId, electorIds[codeA]);
      await createDirectRoll(electionId, electorIds[codeB]);

      const res = await getSummary(electionId, adminToken).expect(200);

      const dbCount = await prisma.electoralRoll.count({ where: { election_id: electionId } });
      expect((res.body as SummaryResponse).registeredVoters).toBe(dbCount);
      expect((res.body as SummaryResponse).registeredVoters).toBe(2);
    });
  });

  describe('Read-only behavior', () => {
    it('SR1: the endpoint does not create, update, or delete records', async () => {
      const electionId = await seedElection();
      await createDirectRoll(electionId, electorIds[codeA]);

      const before = {
        rolls: await prisma.electoralRoll.count({ where: { election_id: electionId } }),
        electors: await prisma.elector.count({ where: { student_code: { in: usedStudentCodes } } }),
        auditEntries: await prisma.auditLog.count({ where: { user_id: adminUser.id } }),
      };
      const electionBefore = await prisma.election.findUnique({ where: { id: electionId } });

      await getSummary(electionId, adminToken).expect(200);

      const after = {
        rolls: await prisma.electoralRoll.count({ where: { election_id: electionId } }),
        electors: await prisma.elector.count({ where: { student_code: { in: usedStudentCodes } } }),
        auditEntries: await prisma.auditLog.count({ where: { user_id: adminUser.id } }),
      };
      const electionAfter = await prisma.election.findUnique({ where: { id: electionId } });

      expect(after).toEqual(before);
      expect(electionAfter).toEqual(electionBefore);
    });
  });

  describe('Response contract', () => {
    it('SF1: the response contains exactly the two summary fields', async () => {
      const electionId = await seedElection();
      await createDirectRoll(electionId, electorIds[codeA]);

      const res = await getSummary(electionId, adminToken).expect(200);

      expect(Object.keys(res.body as SummaryResponse).sort()).toEqual([
        'electionName',
        'registeredVoters',
      ]);
    });

    it('SF2: the election name is sourced from persisted data', async () => {
      const electionId = await seedElection();

      const res = await getSummary(electionId, adminToken).expect(200);

      const persisted = await prisma.election.findUnique({ where: { id: electionId } });
      expect((res.body as SummaryResponse).electionName).toBe(persisted!.name);
    });

    it('SF3: the registered-voter count is sourced from persisted roll data', async () => {
      const electionId = await seedElection();
      await createDirectRoll(electionId, electorIds[codeA]);

      const res = await getSummary(electionId, adminToken).expect(200);

      const dbCount = await prisma.electoralRoll.count({ where: { election_id: electionId } });
      expect((res.body as SummaryResponse).registeredVoters).toBe(dbCount);
    });

    it('SF4: no unnecessary sensitive information is exposed', async () => {
      const electionId = await seedElection();
      await createDirectRoll(electionId, electorIds[codeA]);

      const res = await getSummary(electionId, adminToken).expect(200);

      const serialized = JSON.stringify(res.body).toLowerCase();
      expect(serialized).not.toContain('password');
      expect(serialized).not.toContain('password_hash');
      expect(serialized).not.toContain('email');
      expect(serialized).not.toContain('token');
      expect(serialized).not.toContain('mfa');
      expect(serialized).not.toContain('student');
    });
  });

  describe('Swagger / OpenAPI', () => {
    it('SW1-SW6: the generated OpenAPI document documents the endpoint', () => {
      const config = new DocumentBuilder()
        .setTitle('Votium API')
        .setDescription('Electronic voting system API')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
      const document = SwaggerModule.createDocument(app, config);

      // SW1: the path exists (global prefix may or may not be prefixed depending
      // on the running NestJS/swagger version).
      const pathKey = Object.keys(document.paths).find((p) =>
        p.endsWith('/electoral-rolls/{electionId}'),
      );
      expect(pathKey).toBeDefined();
      const operation = document.paths[pathKey!].get as unknown as SwaggerOperationShape;
      expect(operation).toBeDefined();

      // SW2: the operation is grouped under the electoral-rolls tag.
      expect(operation.tags).toContain('electoral-rolls');

      // SW3: the election identifier path parameter is documented.
      const param = operation.parameters;
      expect(param).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'electionId',
            in: 'path',
            required: true,
          }),
        ]),
      );

      // SW4: authentication is documented at the operation level.
      expect(operation.security).toEqual([{ bearer: [] }]);
      expect(document.components?.securitySchemes?.bearer).toBeDefined();

      // SW5: the successful response schema matches the runtime response.
      const success = operation.responses['200'];
      expect(success).toBeDefined();
      const schemaRef = success.content['application/json'].schema.$ref;
      expect(schemaRef).toBe('#/components/schemas/ElectoralRollSummaryResponseDto');
      const summarySchema = document.components?.schemas?.['ElectoralRollSummaryResponseDto'] as
        | { properties: { electionName?: { type?: string }; registeredVoters?: { type?: string } } }
        | undefined;
      expect(summarySchema).toBeDefined();
      expect(summarySchema!.properties.electionName).toMatchObject({ type: 'string' });
      expect(summarySchema!.properties.registeredVoters).toMatchObject({ type: 'number' });

      // SW6: the relevant error responses are documented.
      expect(operation.responses['400']).toBeDefined();
      expect(operation.responses['401']).toBeDefined();
      expect(operation.responses['403']).toBeDefined();
      expect(operation.responses['404']).toBeDefined();
    });
  });
});
