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
}

interface LoginResponseBody {
  mfaRequired: boolean;
  sessionId: string;
  expiresIn: number;
  message: string;
}

interface ManualRegisterResponse {
  message: string;
  totalRows: number;
  registered: number;
  alreadyRegistered: number;
  notFound: number;
  invalidRows: number;
  errors: Array<{ row: number; reason: string }>;
}

interface SwaggerOperationShape {
  tags?: string[];
  parameters?: Array<{ name: string; in: string; required: boolean }>;
  security?: Array<{ bearer: string[] }>;
  requestBody?: {
    required?: boolean;
    content: Record<string, { schema: { $ref?: string } }>;
  };
  responses: Record<string, { content: Record<string, { schema: { $ref?: string } }> }>;
}

type SeedStatus = 'CREATED' | 'PENDING' | 'PUBLISHED' | 'ACTIVE' | 'CLOSED';

describe('Manual electoral roll registration (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let emailService: FakeEmailService;

  let adminUser: { id: string; email: string; password: string };
  let auditorUser: { id: string; email: string; password: string };
  let adminToken = '';
  let auditorToken = '';
  let electorToken = '';

  const suffix = Date.now();
  let electionCounter = 0;

  const usedElectionIds: string[] = [];
  const usedStudentCodes: string[] = [];
  const usedUserIds: string[] = [];

  const codeA = `MANUAL-A-${suffix}`;
  const codeB = `MANUAL-B-${suffix}`;
  const codeC = `MANUAL-C-${suffix}`;
  const codeD = `MANUAL-D-${suffix}`;
  const ghostA = `MANUAL-GHOST-A-${suffix}`;
  const ghostB = `MANUAL-GHOST-B-${suffix}`;

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

  const craftToken = (
    payload: Record<string, unknown>,
    expiresIn: number | string = envs.jwtExpiresIn,
  ) => jwt.sign(payload, envs.jwtSecret, { expiresIn });

  const manualRegister = (electionId: string, body: Record<string, unknown>, token?: string) => {
    const req = request(app.getHttpServer()).post(`/api/v1/electoral-rolls/register/${electionId}`);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send(body);
  };

  const seedElection = async (status: SeedStatus): Promise<string> => {
    const name = `E2E-MANUAL-${status}-${suffix}-${electionCounter++}`;
    const created = await prisma.election.create({
      data: {
        name,
        description: 'E2E manual electoral roll election.',
        start_date: new Date(Date.UTC(2026, 9, 1)),
        start_time: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        end_date: new Date(Date.UTC(2026, 9, 1)),
        end_time: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
        current_status: status,
      },
    });
    usedElectionIds.push(created.id);
    return created.id;
  };

  const seedElector = async (code: string, programCode: string, status = 'ACTIVE') => {
    const created = await prisma.elector.create({
      data: {
        first_name: 'Manual',
        last_name: 'Test',
        email: `${code}-${suffix}@example.com`,
        password_hash: 'pbkdf2$placeholder',
        student_code: code,
        program_code: programCode,
        status,
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

  const historyFor = async (electionId: string) =>
    prisma.electionStatusHistory.findMany({
      where: { election_id: electionId },
      orderBy: { changed_at: 'asc' },
    });

  const entries = (...pairs: Array<[string, string]>): Record<string, unknown> => ({
    electors: pairs.map(([studentCode, programCode]) => ({ studentCode, programCode })),
  });

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
      email: `e2e-manual-admin-${suffix}@example.com`,
      password: 'SuperSecret123!',
    };
    auditorUser = {
      id: '',
      email: `e2e-manual-auditor-${suffix}@example.com`,
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

    const electorActorCode = `MANUAL-ELECTOR-${suffix}`;
    const createdElector = await prisma.elector.create({
      data: {
        first_name: 'E2E',
        last_name: 'Elector',
        email: `e2e-manual-elector-${suffix}@example.com`,
        password_hash: await hasher.hash('SuperSecret123!'),
        student_code: electorActorCode,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    usedStudentCodes.push(electorActorCode);

    await seedElector(codeA, '2710');
    await seedElector(codeB, '2710');
    await seedElector(codeC, '2711');
    await seedElector(codeD, '2710', 'INACTIVE');

    adminToken = await completeLogin(adminUser.email, adminUser.password);
    auditorToken = await completeLogin(auditorUser.email, auditorUser.password);
    electorToken = await completeElectorLogin(createdElector.email, 'SuperSecret123!');
  });

  afterAll(async () => {
    if (usedElectionIds.length > 0) {
      await prisma.electionStatusHistory.deleteMany({
        where: { election_id: { in: usedElectionIds } },
      });
      await prisma.electoralRoll.deleteMany({
        where: { election_id: { in: usedElectionIds } },
      });
      await prisma.election.deleteMany({ where: { id: { in: usedElectionIds } } });
    }
    if (usedUserIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { user_id: { in: usedUserIds } } });
      await prisma.mfaChallenge.deleteMany({ where: { user_id: { in: usedUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: usedUserIds } } });
    }
    if (usedStudentCodes.length > 0) {
      await prisma.electorMfaChallenge.deleteMany({
        where: { elector: { student_code: { in: usedStudentCodes } } },
      });
      await prisma.elector.deleteMany({ where: { student_code: { in: usedStudentCodes } } });
    }
    await app.close();
  });

  describe('Authorization', () => {
    it('MA1: an authenticated administrator registers a single elector', async () => {
      const electionId = await seedElection('CREATED');

      const res = await manualRegister(electionId, entries([codeA, '2710']), adminToken).expect(
        200,
      );

      expect(res.body).toEqual(
        expect.objectContaining<Partial<ManualRegisterResponse>>({
          registered: 1,
        }),
      );
    });

    it('MA2: an authenticated administrator registers multiple electors', async () => {
      const electionId = await seedElection('CREATED');

      const res = await manualRegister(
        electionId,
        entries([codeA, '2710'], [codeB, '2710'], [codeC, '2711']),
        adminToken,
      ).expect(200);

      expect(res.body).toEqual(
        expect.objectContaining<Partial<ManualRegisterResponse>>({
          totalRows: 3,
          registered: 3,
        }),
      );
    });

    it('MA3: an auditor is rejected with 403', async () => {
      const electionId = await seedElection('CREATED');

      const res = await manualRegister(electionId, entries([codeA, '2710']), auditorToken).expect(
        403,
      );

      expect(res.body).toMatchObject({ statusCode: 403 });
    });

    it('MA4: an elector/voter token is rejected with 403', async () => {
      const electionId = await seedElection('CREATED');

      const res = await manualRegister(electionId, entries([codeA, '2710']), electorToken).expect(
        403,
      );

      expect(res.body).toMatchObject({ statusCode: 403 });
    });

    it('MA5: a token with an unknown role is rejected with 403', async () => {
      const electionId = await seedElection('CREATED');
      const unauthorized = craftToken({
        sub: adminUser.id,
        email: adminUser.email,
        actorType: 'USER',
        role: 'SOME_OTHER',
      });

      const res = await manualRegister(electionId, entries([codeA, '2710']), unauthorized).expect(
        403,
      );

      expect(res.body).toMatchObject({ statusCode: 403 });
    });

    it('MA6: a missing JWT is rejected with 401', async () => {
      const electionId = await seedElection('CREATED');

      await manualRegister(electionId, entries([codeA, '2710'])).expect(401);
    });

    it('MA7: an invalid JWT is rejected with 401', async () => {
      const electionId = await seedElection('CREATED');

      await manualRegister(electionId, entries([codeA, '2710']), 'not-a-token').expect(401);
    });

    it('MA8: an expired JWT is rejected with 401', async () => {
      const electionId = await seedElection('CREATED');
      const expired = craftToken(
        { sub: adminUser.id, email: adminUser.email, actorType: 'USER', role: 'ADMINISTRATOR' },
        -60,
      );

      const res = await manualRegister(electionId, entries([codeA, '2710']), expired).expect(401);

      expect(res.body).toMatchObject({ statusCode: 401 });
    });

    it('MA9: a client-supplied role header cannot bypass authorization', async () => {
      const electionId = await seedElection('CREATED');

      const res = await request(app.getHttpServer())
        .post(`/api/v1/electoral-rolls/register/${electionId}`)
        .set('Authorization', `Bearer ${electorToken}`)
        .set('x-role', 'ADMINISTRATOR')
        .send(entries([codeA, '2710']))
        .expect(403);

      expect(res.body).toMatchObject({ statusCode: 403 });
    });
  });

  describe('Input validation', () => {
    it('MV1: a request without a body is rejected with 400', async () => {
      const electionId = await seedElection('CREATED');

      const res = await request(app.getHttpServer())
        .post(`/api/v1/electoral-rolls/register/${electionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('MV2: an empty electors array is rejected with 400', async () => {
      const electionId = await seedElection('CREATED');

      const res = await manualRegister(electionId, { electors: [] }, adminToken).expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('MV3: a missing studentCode is rejected with 400', async () => {
      const electionId = await seedElection('CREATED');

      const res = await manualRegister(
        electionId,
        { electors: [{ programCode: '2710' }] },
        adminToken,
      ).expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('MV4: a whitespace-only studentCode is rejected with 400', async () => {
      const electionId = await seedElection('CREATED');

      const res = await manualRegister(
        electionId,
        { electors: [{ studentCode: '   ', programCode: '2710' }] },
        adminToken,
      ).expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('MV5: a missing programCode is rejected with 400', async () => {
      const electionId = await seedElection('CREATED');

      const res = await manualRegister(
        electionId,
        { electors: [{ studentCode: codeA }] },
        adminToken,
      ).expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it.each(['2A70', '271'])(
      'MV6: an invalid programCode format (%s) is rejected with 400',
      async (programCode) => {
        const electionId = await seedElection('CREATED');

        const res = await manualRegister(
          electionId,
          { electors: [{ studentCode: codeA, programCode }] },
          adminToken,
        ).expect(400);

        expect(res.body).toMatchObject({ statusCode: 400 });
        expect(JSON.stringify(res.body)).toContain(
          'Program code must contain exactly four digits.',
        );
      },
    );

    it('MV7: a non-UUID election identifier is rejected with 400', async () => {
      const res = await manualRegister('not-a-uuid', entries([codeA, '2710']), adminToken).expect(
        400,
      );

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('MV8: unknown request properties are rejected with 400', async () => {
      const electionId = await seedElection('CREATED');

      const res = await manualRegister(
        electionId,
        { electors: [{ studentCode: codeA, programCode: '2710' }], role: 'ADMINISTRATOR' },
        adminToken,
      ).expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });
  });

  describe('Elector matching', () => {
    it('MM1: an existing pair resolves and creates a roll pointing to the elector', async () => {
      const electionId = await seedElection('CREATED');

      const res = await manualRegister(electionId, entries([codeA, '2710']), adminToken).expect(
        200,
      );
      const body = res.body as ManualRegisterResponse;

      expect(body.registered).toBe(1);
      expect(body.notFound).toBe(0);

      const rolls = await prisma.electoralRoll.findMany({
        where: { election_id: electionId },
      });
      expect(rolls).toHaveLength(1);
      expect(rolls[0].elector_id).toBe(electorIds[codeA]);
    });

    it('MM6: a programCode with surrounding whitespace is trimmed and matches', async () => {
      const electionId = await seedElection('CREATED');

      const res = await manualRegister(
        electionId,
        { electors: [{ studentCode: codeA, programCode: ' 2710 ' }] },
        adminToken,
      ).expect(200);
      const body = res.body as ManualRegisterResponse;

      expect(body.registered).toBe(1);
      expect(body.notFound).toBe(0);
    });

    it('MM2: a wrong program code does not match', async () => {
      const electionId = await seedElection('CREATED');

      const res = await manualRegister(electionId, entries([codeA, '2711']), adminToken).expect(
        200,
      );
      const body = res.body as ManualRegisterResponse;

      expect(body.notFound).toBe(1);
      expect(body.registered).toBe(0);
    });

    it('MM3: a wrong student code does not match', async () => {
      const electionId = await seedElection('CREATED');

      const res = await manualRegister(electionId, entries([ghostA, '2710']), adminToken).expect(
        200,
      );
      const body = res.body as ManualRegisterResponse;

      expect(body.notFound).toBe(1);
      expect(body.registered).toBe(0);
    });

    it('MM4: an unmatched pair never creates an elector', async () => {
      const electionId = await seedElection('CREATED');
      const before = await prisma.elector.count({
        where: { student_code: { in: usedStudentCodes } },
      });

      const res = await manualRegister(electionId, entries([ghostA, '2710']), adminToken).expect(
        200,
      );
      const body = res.body as ManualRegisterResponse;

      expect(body.notFound).toBe(1);
      const after = await prisma.elector.count({
        where: { student_code: { in: usedStudentCodes } },
      });
      expect(after).toBe(before);

      const ghost = await prisma.elector.findUnique({
        where: { student_code: ghostA },
      });
      expect(ghost).toBeNull();
    });

    it('MM5: an INACTIVE elector is reported as an invalid row', async () => {
      const electionId = await seedElection('CREATED');

      const res = await manualRegister(electionId, entries([codeD, '2710']), adminToken).expect(
        200,
      );

      expect(res.body).toEqual(
        expect.objectContaining<Partial<ManualRegisterResponse>>({
          totalRows: 1,
          registered: 0,
          invalidRows: 1,
          errors: [{ row: 1, reason: 'Elector is not active.' }],
        }),
      );
    });
  });

  describe('Electoral roll & duplicates', () => {
    it('MD1: an already registered elector is not duplicated', async () => {
      const electionId = await seedElection('CREATED');
      await createDirectRoll(electionId, electorIds[codeA]);

      const res = await manualRegister(electionId, entries([codeA, '2710']), adminToken).expect(
        200,
      );

      expect(res.body).toEqual(
        expect.objectContaining<Partial<ManualRegisterResponse>>({
          totalRows: 1,
          registered: 0,
          alreadyRegistered: 1,
        }),
      );
      expect(await prisma.electoralRoll.count({ where: { election_id: electionId } })).toBe(1);
    });

    it('MD2: a repeated request is idempotent', async () => {
      const electionId = await seedElection('CREATED');
      const body = entries([codeA, '2710']);

      await manualRegister(electionId, body, adminToken).expect(200);
      const res = await manualRegister(electionId, body, adminToken).expect(200);

      expect(res.body).toEqual(
        expect.objectContaining<Partial<ManualRegisterResponse>>({
          registered: 0,
          alreadyRegistered: 1,
        }),
      );
      expect(await prisma.electoralRoll.count({ where: { election_id: electionId } })).toBe(1);
    });

    it('MD3: duplicate entries within one request are registered only once', async () => {
      const electionId = await seedElection('CREATED');

      const res = await manualRegister(
        electionId,
        {
          electors: [
            { studentCode: codeA, programCode: '2710' },
            { studentCode: codeA, programCode: '2710' },
          ],
        },
        adminToken,
      ).expect(200);

      expect(res.body).toEqual(
        expect.objectContaining<Partial<ManualRegisterResponse>>({
          totalRows: 2,
          registered: 1,
        }),
      );
      expect(await prisma.electoralRoll.count({ where: { election_id: electionId } })).toBe(1);
    });

    it('MD4: registration is scoped to the route election', async () => {
      const electionA = await seedElection('CREATED');
      const electionB = await seedElection('CREATED');

      await manualRegister(electionA, entries([codeA, '2710']), adminToken).expect(200);
      const res = await manualRegister(electionB, entries([codeA, '2710']), adminToken).expect(200);

      expect(res.body).toEqual(
        expect.objectContaining<Partial<ManualRegisterResponse>>({
          registered: 1,
          alreadyRegistered: 0,
        }),
      );

      const rollsA = await prisma.electoralRoll.findMany({ where: { election_id: electionA } });
      const rollsB = await prisma.electoralRoll.findMany({ where: { election_id: electionB } });
      expect(rollsA).toHaveLength(1);
      expect(rollsB).toHaveLength(1);
      expect(rollsA[0].elector_id).toBe(electorIds[codeA]);
      expect(rollsB[0].elector_id).toBe(electorIds[codeA]);
    });

    it('MD5: a duplicate unmatched pair is reported only once', async () => {
      const electionId = await seedElection('CREATED');

      const res = await manualRegister(
        electionId,
        {
          electors: [
            { studentCode: ghostA, programCode: '2710' },
            { studentCode: ghostA, programCode: '2710' },
          ],
        },
        adminToken,
      ).expect(200);
      const body = res.body as ManualRegisterResponse;

      expect(body.totalRows).toBe(2);
      expect(body.notFound).toBe(1);
      expect(body.errors).toHaveLength(1);
    });
  });

  describe('Election rules', () => {
    it('ME1: a nonexistent election returns 404', async () => {
      const res = await manualRegister(
        '00000000-0000-4000-8000-000000000000',
        entries([codeA, '2710']),
        adminToken,
      ).expect(404);

      expect(res.body).toMatchObject({ statusCode: 404, error: 'ELECTION_NOT_FOUND' });
    });

    it('ME2: a CREATED election accepts the registration', async () => {
      const electionId = await seedElection('CREATED');

      const res = await manualRegister(electionId, entries([codeA, '2710']), adminToken).expect(
        200,
      );

      expect((res.body as ManualRegisterResponse).registered).toBe(1);
    });

    it('ME3: a PENDING election accepts the registration', async () => {
      const electionId = await seedElection('PENDING');

      const res = await manualRegister(electionId, entries([codeA, '2710']), adminToken).expect(
        200,
      );

      expect((res.body as ManualRegisterResponse).registered).toBe(1);
    });

    it.each(['PUBLISHED', 'ACTIVE', 'CLOSED'] as const)(
      'ME%d: a %s election is rejected with 409',
      async (status) => {
        const electionId = await seedElection(status);

        const res = await manualRegister(electionId, entries([codeA, '2710']), adminToken).expect(
          409,
        );

        expect(res.body).toMatchObject({
          statusCode: 409,
          error: 'ELECTION_NOT_REGISTERABLE',
        });
      },
    );

    it('ME7: a rejected registration writes nothing', async () => {
      const electionId = await seedElection('PUBLISHED');

      const res = await manualRegister(
        electionId,
        entries([codeA, '2710'], [codeB, '2710']),
        adminToken,
      ).expect(409);

      expect((res.body as { statusCode: number }).statusCode).toBe(409);

      const rolls = await prisma.electoralRoll.count({ where: { election_id: electionId } });
      expect(rolls).toBe(0);
      const history = await historyFor(electionId);
      expect(history).toHaveLength(0);
      const rowInDb = await prisma.election.findUnique({ where: { id: electionId } });
      expect(rowInDb!.current_status).toBe('PUBLISHED');
    });
  });

  describe('Status transitions', () => {
    it('MT1: a CREATED election transitions to PENDING after a successful load', async () => {
      const electionId = await seedElection('CREATED');

      await manualRegister(electionId, entries([codeA, '2710']), adminToken).expect(200);

      const rowInDb = await prisma.election.findUnique({ where: { id: electionId } });
      expect(rowInDb!.current_status).toBe('PENDING');

      const history = await historyFor(electionId);
      expect(history).toHaveLength(1);
      expect(history[0].old_status).toBe('CREATED');
      expect(history[0].new_status).toBe('PENDING');
      expect(history[0].user_id).toBe(adminUser.id);
    });

    it('MT2: a PENDING election stays PENDING with no new history row', async () => {
      const electionId = await seedElection('PENDING');

      await manualRegister(electionId, entries([codeA, '2710']), adminToken).expect(200);

      const rowInDb = await prisma.election.findUnique({ where: { id: electionId } });
      expect(rowInDb!.current_status).toBe('PENDING');

      const history = await historyFor(electionId);
      expect(history).toHaveLength(0);
    });

    it('MT3: a CREATED election with zero new registrations stays CREATED', async () => {
      const electionId = await seedElection('CREATED');
      await createDirectRoll(electionId, electorIds[codeA]);

      await manualRegister(electionId, entries([codeA, '2710']), adminToken).expect(200);

      const rowInDb = await prisma.election.findUnique({ where: { id: electionId } });
      expect(rowInDb!.current_status).toBe('CREATED');

      const history = await historyFor(electionId);
      expect(history).toHaveLength(0);
    });

    it('MT4: an ELECTION_STATUS_CHANGED audit entry is written on transition', async () => {
      const electionId = await seedElection('CREATED');

      await manualRegister(electionId, entries([codeA, '2710']), adminToken).expect(200);

      const audit = await prisma.auditLog.findMany({
        where: { user_id: adminUser.id, action: 'ELECTION_STATUS_CHANGED' },
      });
      const matching = audit
        .map((entry) => ({
          entry,
          details: JSON.parse(entry.details ?? '{}') as Record<string, unknown>,
        }))
        .filter(({ details }) => details.electionId === electionId);

      expect(matching).toHaveLength(1);
      expect(matching[0].details.newStatus).toBe('PENDING');
    });

    it('MT5: no status audit is written without a transition', async () => {
      const electionId = await seedElection('CREATED');

      await manualRegister(electionId, entries([ghostA, '2710']), adminToken).expect(200);

      const audit = await prisma.auditLog.findMany({
        where: { user_id: adminUser.id, action: 'ELECTION_STATUS_CHANGED' },
      });
      const matching = audit
        .map((entry) => JSON.parse(entry.details ?? '{}') as Record<string, unknown>)
        .filter((details) => details.electionId === electionId);

      expect(matching).toHaveLength(0);
    });
  });

  describe('Multiple records & partial success', () => {
    it('MR1: mixed counts are reported accurately', async () => {
      const electionId = await seedElection('CREATED');
      await createDirectRoll(electionId, electorIds[codeB]);

      const res = await manualRegister(
        electionId,
        {
          electors: [
            { studentCode: codeA, programCode: '2710' }, // new, active
            { studentCode: codeB, programCode: '2710' }, // already registered
            { studentCode: codeD, programCode: '2710' }, // inactive
            { studentCode: ghostA, programCode: '2710' }, // not found
          ],
        },
        adminToken,
      ).expect(200);
      const body = res.body as ManualRegisterResponse;

      expect(body.totalRows).toBe(4);
      expect(body.registered).toBe(1);
      expect(body.alreadyRegistered).toBe(1);
      expect(body.notFound).toBe(1);
      expect(body.invalidRows).toBe(1);
      expect(body.errors).toHaveLength(2);
    });

    it('MR2: error row indexes are 1-based positions in the submitted array', async () => {
      const electionId = await seedElection('CREATED');

      const res = await manualRegister(
        electionId,
        {
          electors: [
            { studentCode: ghostA, programCode: '2710' },
            { studentCode: codeD, programCode: '2710' },
            { studentCode: ghostB, programCode: '2711' },
          ],
        },
        adminToken,
      ).expect(200);
      const body = res.body as ManualRegisterResponse;

      expect(body.errors).toEqual([
        { row: 1, reason: 'Elector not found for the provided student code and program code.' },
        { row: 2, reason: 'Elector is not active.' },
        { row: 3, reason: 'Elector not found for the provided student code and program code.' },
      ]);
    });

    it('MR3: partial success persists the valid rolls (non-atomic convention)', async () => {
      const electionId = await seedElection('CREATED');

      const res = await manualRegister(
        electionId,
        {
          electors: [
            { studentCode: codeA, programCode: '2710' },
            { studentCode: ghostA, programCode: '2710' },
          ],
        },
        adminToken,
      ).expect(200);
      const body = res.body as ManualRegisterResponse;

      expect(body.registered).toBe(1);
      expect(body.notFound).toBe(1);

      const rolls = await prisma.electoralRoll.findMany({
        where: { election_id: electionId },
      });
      expect(rolls).toHaveLength(1);
      expect(rolls[0].elector_id).toBe(electorIds[codeA]);
    });

    it('MR4: dedup and partial success combine accurately', async () => {
      const electionId = await seedElection('CREATED');

      const res = await manualRegister(
        electionId,
        {
          electors: [
            { studentCode: codeA, programCode: '2710' },
            { studentCode: ghostA, programCode: '2710' },
            { studentCode: codeA, programCode: '2710' },
            { studentCode: codeD, programCode: '2710' },
            { studentCode: codeB, programCode: '2710' },
          ],
        },
        adminToken,
      ).expect(200);
      const body = res.body as ManualRegisterResponse;

      expect(body.totalRows).toBe(5);
      expect(body.registered).toBe(2);
      expect(body.notFound).toBe(1);
      expect(body.invalidRows).toBe(1);
      expect(body.errors).toHaveLength(2);
    });
  });

  describe('Response contract', () => {
    it('MF1: the response contains exactly the expected keys', async () => {
      const electionId = await seedElection('CREATED');

      const res = await manualRegister(electionId, entries([codeA, '2710']), adminToken).expect(
        200,
      );

      expect(Object.keys(res.body as ManualRegisterResponse).sort()).toEqual(
        [
          'message',
          'totalRows',
          'registered',
          'alreadyRegistered',
          'notFound',
          'invalidRows',
          'errors',
        ].sort(),
      );
    });

    it('MF2: the registered count matches the persisted roll delta', async () => {
      const electionId = await seedElection('CREATED');
      const before = await prisma.electoralRoll.count({ where: { election_id: electionId } });

      const res = await manualRegister(
        electionId,
        entries([codeA, '2710'], [codeB, '2710']),
        adminToken,
      ).expect(200);
      const body = res.body as ManualRegisterResponse;

      const after = await prisma.electoralRoll.count({ where: { election_id: electionId } });
      expect(body.registered).toBe(after - before);
      expect(body.registered).toBe(2);
    });

    it('MF3: the response includes the completion message', async () => {
      const electionId = await seedElection('CREATED');

      const res = await manualRegister(electionId, entries([codeA, '2710']), adminToken).expect(
        200,
      );

      expect((res.body as ManualRegisterResponse).message).toBe(
        'Electoral roll registration completed.',
      );
    });

    it('MF4: the response does not leak sensitive data', async () => {
      const electionId = await seedElection('CREATED');

      const res = await manualRegister(electionId, entries([codeA, '2710']), adminToken).expect(
        200,
      );

      const serialized = JSON.stringify(res.body).toLowerCase();
      expect(serialized).not.toContain('password');
      expect(serialized).not.toContain('password_hash');
      expect(serialized).not.toContain('email');
      expect(serialized).not.toContain('token');
      expect(serialized).not.toContain('mfa');
      expect(serialized).not.toContain('secret');
      expect(serialized).not.toContain('student');
    });
  });

  describe('Data integrity', () => {
    it('MI1: the elector table is not modified by the endpoint', async () => {
      const electionId = await seedElection('CREATED');
      const before = await prisma.elector.count({
        where: { student_code: { in: usedStudentCodes } },
      });

      await manualRegister(electionId, entries([codeA, '2710']), adminToken).expect(200);

      const after = await prisma.elector.count({
        where: { student_code: { in: usedStudentCodes } },
      });
      expect(after).toBe(before);
    });

    it('MI2: elector identity fields are not modified', async () => {
      const electionId = await seedElection('CREATED');

      await manualRegister(electionId, entries([codeA, '2710']), adminToken).expect(200);

      const elector = await prisma.elector.findUnique({ where: { id: electorIds[codeA] } });
      expect(elector!.student_code).toBe(codeA);
      expect(elector!.program_code).toBe('2710');
    });

    it('MI3: roll rows reference the correct election and electors', async () => {
      const electionId = await seedElection('CREATED');

      await manualRegister(
        electionId,
        entries([codeA, '2710'], [codeB, '2710'], [codeC, '2711']),
        adminToken,
      ).expect(200);

      const rolls = await prisma.electoralRoll.findMany({
        where: { election_id: electionId },
      });
      expect(rolls).toHaveLength(3);
      expect(new Set(rolls.map((r) => r.elector_id))).toEqual(
        new Set([electorIds[codeA], electorIds[codeB], electorIds[codeC]]),
      );
      expect(rolls.every((r) => r.election_id === electionId)).toBe(true);
    });
  });

  describe('Audit', () => {
    it('MB1: a MANUAL_REGISTER_ELECTORAL_ROLL audit entry is written', async () => {
      const electionId = await seedElection('CREATED');

      await manualRegister(electionId, entries([codeA, '2710']), adminToken).expect(200);

      const audit = await prisma.auditLog.findMany({
        where: { user_id: adminUser.id, action: 'MANUAL_REGISTER_ELECTORAL_ROLL' },
      });
      const matching = audit
        .map((entry) => ({
          entry,
          details: JSON.parse(entry.details ?? '{}') as Record<string, unknown>,
        }))
        .filter(({ details }) => details.electionId === electionId);

      expect(matching).toHaveLength(1);
      expect(matching[0].details.totalRows).toBe(1);
      expect(matching[0].details.registered).toBe(1);
      expect(matching[0].details.notFound).toBe(0);
    });

    it('MB2: no registration audit is written for rejected requests', async () => {
      const publishedId = await seedElection('PUBLISHED');
      const missingId = '00000000-0000-4000-8000-000000000000';

      await manualRegister(publishedId, entries([codeA, '2710']), adminToken).expect(409);
      await manualRegister(missingId, entries([codeA, '2710']), adminToken).expect(404);

      const audit = await prisma.auditLog.findMany({
        where: { user_id: adminUser.id, action: 'MANUAL_REGISTER_ELECTORAL_ROLL' },
      });
      const matching = audit
        .map((entry) => JSON.parse(entry.details ?? '{}') as Record<string, unknown>)
        .filter(
          (details) => details.electionId === publishedId || details.electionId === missingId,
        );

      expect(matching).toHaveLength(0);
    });
  });

  describe('Swagger / OpenAPI', () => {
    it('MS1-MS8: the generated OpenAPI document documents the endpoint', () => {
      const config = new DocumentBuilder()
        .setTitle('Votium API')
        .setDescription('Electronic voting system API')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
      const document = SwaggerModule.createDocument(app, config);

      // MS1: the path exists and the post operation is defined.
      const pathKey = Object.keys(document.paths).find((p) =>
        p.endsWith('/electoral-rolls/register/{electionId}'),
      );
      expect(pathKey).toBeDefined();
      const operation = document.paths[pathKey!].post as unknown as SwaggerOperationShape;
      expect(operation).toBeDefined();

      // MS2: the operation is grouped under the electoral-rolls tag.
      expect(operation.tags).toContain('electoral-rolls');

      // MS3: the election identifier path parameter is documented.
      expect(operation.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'electionId',
            in: 'path',
            required: true,
          }),
        ]),
      );

      // MS4: authentication is documented at the operation level.
      expect(operation.security).toEqual([{ bearer: [] }]);
      expect(document.components?.securitySchemes?.bearer).toBeDefined();

      // MS5: the successful response schema is the bulk registration response DTO.
      const success = operation.responses['200'];
      expect(success).toBeDefined();
      const schemaRef = success.content['application/json'].schema.$ref;
      expect(schemaRef).toBe('#/components/schemas/BulkRegisterElectoralRollResponseDto');
      const responseSchema = document.components?.schemas?.[
        'BulkRegisterElectoralRollResponseDto'
      ] as { properties: Record<string, unknown> } | undefined;
      expect(responseSchema).toBeDefined();
      expect(responseSchema!.properties.registered).toBeDefined();
      expect(responseSchema!.properties.alreadyRegistered).toBeDefined();
      expect(responseSchema!.properties.notFound).toBeDefined();
      expect(responseSchema!.properties.errors).toBeDefined();

      // MS6: the relevant error responses are documented.
      expect(operation.responses['400']).toBeDefined();
      expect(operation.responses['401']).toBeDefined();
      expect(operation.responses['403']).toBeDefined();
      expect(operation.responses['404']).toBeDefined();
      expect(operation.responses['409']).toBeDefined();

      // MS7: the request body schema references the RegisterElectoralRollDto component.
      expect(operation.requestBody).toBeDefined();
      const requestSchemaRef = operation.requestBody!.content['application/json'].schema.$ref;
      expect(requestSchemaRef).toBe('#/components/schemas/RegisterElectoralRollDto');
      const requestSchema = document.components?.schemas?.['RegisterElectoralRollDto'] as
        | { properties: { electors?: { type?: string } } }
        | undefined;
      expect(requestSchema).toBeDefined();
      expect(requestSchema!.properties.electors).toMatchObject({ type: 'array' });

      // MS8: the error row field documents its 1-based semantics (W4).
      const errorSchema = document.components?.schemas?.['BulkRegisterElectoralRollErrorDto'] as
        | { properties?: { row?: { description?: string } } }
        | undefined;
      expect(errorSchema).toBeDefined();
      expect(errorSchema!.properties?.row?.description).toContain('1-based');
    });
  });
});
