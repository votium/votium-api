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

interface ElectorResponseBody {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  studentCode: string;
  programCode: string;
  status: string;
  createdAt: string;
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

describe('Electoral roll modification (e2e)', () => {
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

  const updCode = `MOD-A-${suffix}`;
  const otherCode = `MOD-B-${suffix}`;
  const dupCode = `MOD-DUP-${suffix}`;

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

  const patchElector = (
    electionId: string,
    electorId: string,
    body?: Record<string, unknown>,
    token?: string,
  ) => {
    const req = request(app.getHttpServer()).patch(
      `/api/v1/electoral-rolls/${electionId}/electors/${electorId}`,
    );
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send(body ?? {});
  };

  const removeElector = (electionId: string, electorId: string, token?: string) => {
    const req = request(app.getHttpServer()).delete(
      `/api/v1/electoral-rolls/${electionId}/electors/${electorId}`,
    );
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send();
  };

  const seedElection = async (status: SeedStatus): Promise<string> => {
    const name = `E2E-MOD-${status}-${suffix}-${electionCounter++}`;
    const created = await prisma.election.create({
      data: {
        name,
        description: 'E2E electoral roll modification election.',
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

  const resetElectorRow = async (code: string) => {
    const id = electorIds[code];
    if (!id) return;
    await prisma.elector.update({
      where: { id },
      data: {
        first_name: 'Manual',
        last_name: 'Test',
        email: `${code}-${suffix}@example.com`,
        student_code: code,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
  };

  beforeEach(async () => {
    await resetElectorRow(updCode);
    await resetElectorRow(otherCode);
    await resetElectorRow(dupCode);
    await prisma.auditLog.deleteMany({
      where: { user_id: { in: usedUserIds } },
    });
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
      email: `e2e-mod-admin-${suffix}@example.com`,
      password: 'SuperSecret123!',
    };
    auditorUser = {
      id: '',
      email: `e2e-mod-auditor-${suffix}@example.com`,
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

    const electorActorCode = `MOD-ELECTOR-${suffix}`;
    const createdElector = await prisma.elector.create({
      data: {
        first_name: 'E2E',
        last_name: 'Elector',
        email: `e2e-mod-elector-${suffix}@example.com`,
        password_hash: await hasher.hash('SuperSecret123!'),
        student_code: electorActorCode,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    usedStudentCodes.push(electorActorCode);

    await seedElector(updCode, '2710');
    await seedElector(otherCode, '2710');
    await seedElector(dupCode, '2710');

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
    it('UA1: an authenticated administrator can update an elector in the roll', async () => {
      const electionId = await seedElection('PENDING');
      await createDirectRoll(electionId, electorIds[updCode]);

      const res = await patchElector(
        electionId,
        electorIds[updCode],
        { firstName: 'Maria' },
        adminToken,
      ).expect(200);

      expect((res.body as ElectorResponseBody).firstName).toBe('Maria');
    });

    it('UA2: an authenticated administrator can remove an elector from the roll', async () => {
      const electionId = await seedElection('PENDING');
      await createDirectRoll(electionId, electorIds[updCode]);

      const res = await removeElector(electionId, electorIds[updCode], adminToken).expect(204);

      expect(res.body).toEqual({});
    });

    it('UA3: an auditor is rejected with 403 on update', async () => {
      const electionId = await seedElection('PENDING');
      await createDirectRoll(electionId, electorIds[updCode]);

      const res = await patchElector(
        electionId,
        electorIds[updCode],
        { firstName: 'Maria' },
        auditorToken,
      ).expect(403);

      expect(res.body).toMatchObject({ statusCode: 403 });
    });

    it('UA4: an auditor is rejected with 403 on remove', async () => {
      const electionId = await seedElection('PENDING');
      await createDirectRoll(electionId, electorIds[updCode]);

      const res = await removeElector(electionId, electorIds[updCode], auditorToken).expect(403);

      expect(res.body).toMatchObject({ statusCode: 403 });
    });

    it('UA5: an elector/voter token is rejected with 403', async () => {
      const electionId = await seedElection('PENDING');
      await createDirectRoll(electionId, electorIds[updCode]);

      const res = await patchElector(
        electionId,
        electorIds[updCode],
        { firstName: 'Maria' },
        electorToken,
      ).expect(403);

      expect(res.body).toMatchObject({ statusCode: 403 });
    });

    it('UA6: a token with an unknown role is rejected with 403', async () => {
      const electionId = await seedElection('PENDING');
      await createDirectRoll(electionId, electorIds[updCode]);
      const unauthorized = craftToken({
        sub: adminUser.id,
        email: adminUser.email,
        actorType: 'USER',
        role: 'SOME_OTHER',
      });

      const res = await patchElector(
        electionId,
        electorIds[updCode],
        { firstName: 'Maria' },
        unauthorized,
      ).expect(403);

      expect(res.body).toMatchObject({ statusCode: 403 });
    });

    it('UA7: a missing JWT is rejected with 401', async () => {
      const electionId = await seedElection('PENDING');
      await createDirectRoll(electionId, electorIds[updCode]);

      await patchElector(electionId, electorIds[updCode], { firstName: 'Maria' }).expect(401);
      await removeElector(electionId, electorIds[updCode]).expect(401);
    });

    it('UA8: an invalid JWT is rejected with 401', async () => {
      const electionId = await seedElection('PENDING');
      await createDirectRoll(electionId, electorIds[updCode]);

      await patchElector(
        electionId,
        electorIds[updCode],
        { firstName: 'Maria' },
        'not-a-token',
      ).expect(401);
      await removeElector(electionId, electorIds[updCode], 'not-a-token').expect(401);
    });

    it('UA9: an expired JWT is rejected with 401', async () => {
      const electionId = await seedElection('PENDING');
      await createDirectRoll(electionId, electorIds[updCode]);
      const expired = craftToken(
        { sub: adminUser.id, email: adminUser.email, actorType: 'USER', role: 'ADMINISTRATOR' },
        -60,
      );

      const res = await patchElector(
        electionId,
        electorIds[updCode],
        { firstName: 'Maria' },
        expired,
      ).expect(401);

      expect(res.body).toMatchObject({ statusCode: 401 });
    });

    it('UA10: a client-supplied role header cannot bypass authorization', async () => {
      const electionId = await seedElection('PENDING');
      await createDirectRoll(electionId, electorIds[updCode]);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/electoral-rolls/${electionId}/electors/${electorIds[updCode]}`)
        .set('Authorization', `Bearer ${electorToken}`)
        .set('x-role', 'ADMINISTRATOR')
        .send({ firstName: 'Maria' })
        .expect(403);

      expect(res.body).toMatchObject({ statusCode: 403 });
    });
  });

  describe('Input validation', () => {
    it('UV1: a non-UUID electionId is rejected with 400 on update', async () => {
      const res = await patchElector(
        'not-a-uuid',
        electorIds[updCode],
        { firstName: 'Maria' },
        adminToken,
      ).expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('UV2: a non-UUID electorId is rejected with 400 on update', async () => {
      const electionId = await seedElection('PENDING');

      const res = await patchElector(
        electionId,
        'not-a-uuid',
        { firstName: 'Maria' },
        adminToken,
      ).expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('UV3: a non-UUID electionId is rejected with 400 on remove', async () => {
      const res = await removeElector('not-a-uuid', electorIds[updCode], adminToken).expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('UV4: a non-UUID electorId is rejected with 400 on remove', async () => {
      const electionId = await seedElection('PENDING');

      const res = await removeElector(electionId, 'not-a-uuid', adminToken).expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('UV5: unknown body properties are rejected with 400', async () => {
      const electionId = await seedElection('PENDING');
      await createDirectRoll(electionId, electorIds[updCode]);

      const res = await patchElector(
        electionId,
        electorIds[updCode],
        { firstName: 'Maria', status: 'INACTIVE' },
        adminToken,
      ).expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it.each(['2A70', '271', ''])(
      'UV6: an invalid programCode format (%s) is rejected with 400',
      async (programCode) => {
        const electionId = await seedElection('PENDING');
        await createDirectRoll(electionId, electorIds[updCode]);

        const res = await patchElector(
          electionId,
          electorIds[updCode],
          { programCode },
          adminToken,
        ).expect(400);

        expect(res.body).toMatchObject({ statusCode: 400 });
        expect(JSON.stringify(res.body)).toContain(
          'Program code must contain exactly four digits.',
        );
      },
    );

    it('UV7: a whitespace-only firstName is rejected with 400', async () => {
      const electionId = await seedElection('PENDING');
      await createDirectRoll(electionId, electorIds[updCode]);

      const res = await patchElector(
        electionId,
        electorIds[updCode],
        { firstName: '   ' },
        adminToken,
      ).expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('UV8: an empty email is rejected with 400', async () => {
      const electionId = await seedElection('PENDING');
      await createDirectRoll(electionId, electorIds[updCode]);

      const res = await patchElector(
        electionId,
        electorIds[updCode],
        { email: '' },
        adminToken,
      ).expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });
  });

  describe('Update — success & business rules', () => {
    it('UU1: on a PENDING election updates only the provided fields and persists them', async () => {
      const electionId = await seedElection('PENDING');
      await createDirectRoll(electionId, electorIds[updCode]);

      const res = await patchElector(
        electionId,
        electorIds[updCode],
        { firstName: 'Maria', programCode: '2715' },
        adminToken,
      ).expect(200);
      const body = res.body as ElectorResponseBody;

      expect(body.id).toBe(electorIds[updCode]);
      expect(body.firstName).toBe('Maria');
      expect(body.programCode).toBe('2715');
      expect(body.lastName).toBe('Test');
      expect(body.studentCode).toBe(updCode);
      expect(body.status).toBe('ACTIVE');
      expect(body.createdAt).toEqual(expect.any(String));

      const persisted = await prisma.elector.findUnique({ where: { id: electorIds[updCode] } });
      expect(persisted?.first_name).toBe('Maria');
      expect(persisted?.program_code).toBe('2715');
      expect(persisted?.last_name).toBe('Test');
    });

    it('UU2: trims surrounding whitespace before persisting', async () => {
      const electionId = await seedElection('PENDING');
      await createDirectRoll(electionId, electorIds[updCode]);

      const res = await patchElector(
        electionId,
        electorIds[updCode],
        { firstName: '  Maria  ', studentCode: `  ${updCode}B  ` },
        adminToken,
      ).expect(200);
      usedStudentCodes.push(`${updCode}B`);

      expect((res.body as ElectorResponseBody).firstName).toBe('Maria');

      const persisted = await prisma.elector.findUnique({ where: { id: electorIds[updCode] } });
      expect(persisted?.first_name).toBe('Maria');
      expect(persisted?.student_code).toBe(`${updCode}B`);
    });

    it('UU3: an empty body is a no-op that returns the current elector', async () => {
      const electionId = await seedElection('PENDING');
      await createDirectRoll(electionId, electorIds[updCode]);

      const res = await patchElector(electionId, electorIds[updCode], {}, adminToken).expect(200);
      const body = res.body as ElectorResponseBody;

      expect(body.firstName).toBe('Manual');
      expect(body.lastName).toBe('Test');
      expect(body.studentCode).toBe(updCode);
      expect(body.programCode).toBe('2710');
    });

    it('UU4: a CREATED election is rejected with 409 ELECTION_NOT_MODIFIABLE', async () => {
      const electionId = await seedElection('CREATED');
      await createDirectRoll(electionId, electorIds[updCode]);

      const res = await patchElector(
        electionId,
        electorIds[updCode],
        { firstName: 'Maria' },
        adminToken,
      ).expect(409);

      expect(res.body).toMatchObject({ statusCode: 409, error: 'ELECTION_NOT_MODIFIABLE' });
    });

    it.each(['PUBLISHED', 'ACTIVE', 'CLOSED'])(
      'UU5: a %s election is rejected with 409 ELECTION_NOT_MODIFIABLE',
      async (status) => {
        const electionId = await seedElection(status as SeedStatus);
        await createDirectRoll(electionId, electorIds[updCode]);

        const res = await patchElector(
          electionId,
          electorIds[updCode],
          { firstName: 'Maria' },
          adminToken,
        ).expect(409);

        expect(res.body).toMatchObject({ statusCode: 409, error: 'ELECTION_NOT_MODIFIABLE' });
      },
    );

    it('UU6: a nonexistent election returns 404 ELECTION_NOT_FOUND', async () => {
      const res = await patchElector(
        '00000000-0000-4000-8000-000000000000',
        electorIds[updCode],
        { firstName: 'Maria' },
        adminToken,
      ).expect(404);

      expect(res.body).toMatchObject({ statusCode: 404, error: 'ELECTION_NOT_FOUND' });
    });

    it('UU7: a nonexistent elector returns 404 ELECTOR_NOT_FOUND', async () => {
      const electionId = await seedElection('PENDING');

      const res = await patchElector(
        electionId,
        '00000000-0000-4000-8000-000000000000',
        { firstName: 'Maria' },
        adminToken,
      ).expect(404);

      expect(res.body).toMatchObject({ statusCode: 404, error: 'ELECTOR_NOT_FOUND' });
    });

    it('UU8: an elector not in this election roll returns 404 ELECTORAL_ROLL_NOT_FOUND', async () => {
      const electionId = await seedElection('PENDING');

      const res = await patchElector(
        electionId,
        electorIds[updCode],
        { firstName: 'Maria' },
        adminToken,
      ).expect(404);

      expect(res.body).toMatchObject({
        statusCode: 404,
        error: 'ELECTORAL_ROLL_NOT_FOUND',
      });
    });

    it('UU9: an elector in another election roll is never updated by this election PATCH', async () => {
      const electionA = await seedElection('PENDING');
      const electionB = await seedElection('PENDING');
      await createDirectRoll(electionA, electorIds[updCode]);

      const res = await patchElector(
        electionB,
        electorIds[updCode],
        { firstName: 'Maria' },
        adminToken,
      ).expect(404);

      expect(res.body).toMatchObject({ error: 'ELECTORAL_ROLL_NOT_FOUND' });

      const persisted = await prisma.elector.findUnique({ where: { id: electorIds[updCode] } });
      expect(persisted?.first_name).toBe('Manual');
    });

    it('UU10: a duplicate email conflict returns 409 ELECTOR_CONFLICT and persists nothing', async () => {
      const electionId = await seedElection('PENDING');
      await createDirectRoll(electionId, electorIds[updCode]);
      const conflictingEmail = `${dupCode}-${suffix}@example.com`;

      const res = await patchElector(
        electionId,
        electorIds[updCode],
        { email: conflictingEmail },
        adminToken,
      ).expect(409);

      expect(res.body).toMatchObject({ statusCode: 409, error: 'ELECTOR_CONFLICT' });

      const persisted = await prisma.elector.findUnique({ where: { id: electorIds[updCode] } });
      expect(persisted?.email).toBe(`${updCode}-${suffix}@example.com`);
    });
  });

  describe('Delete — success & business rules', () => {
    it('UD1: on a PENDING election removes the association and returns 204 without a body', async () => {
      const electionId = await seedElection('PENDING');
      await createDirectRoll(electionId, electorIds[updCode]);

      const res = await removeElector(electionId, electorIds[updCode], adminToken).expect(204);

      expect(res.body).toEqual({});
    });

    it('UD2: leaves the elector row in place after removing the association', async () => {
      const electionId = await seedElection('PENDING');
      await createDirectRoll(electionId, electorIds[updCode]);

      await removeElector(electionId, electorIds[updCode], adminToken).expect(204);

      const rollCount = await prisma.electoralRoll.count({
        where: { election_id: electionId, elector_id: electorIds[updCode] },
      });
      expect(rollCount).toBe(0);

      const elector = await prisma.elector.findUnique({ where: { id: electorIds[updCode] } });
      expect(elector).not.toBeNull();
      expect(elector?.student_code).toBe(updCode);
    });

    it('UD3: preserves the association with another election', async () => {
      const electionA = await seedElection('PENDING');
      const electionB = await seedElection('PENDING');
      await createDirectRoll(electionA, electorIds[updCode]);
      await createDirectRoll(electionB, electorIds[updCode]);

      await removeElector(electionA, electorIds[updCode], adminToken).expect(204);

      const rollA = await prisma.electoralRoll.count({
        where: { election_id: electionA, elector_id: electorIds[updCode] },
      });
      const rollB = await prisma.electoralRoll.count({
        where: { election_id: electionB, elector_id: electorIds[updCode] },
      });
      expect(rollA).toBe(0);
      expect(rollB).toBe(1);
    });

    it('UD4: a second DELETE returns 404 ELECTORAL_ROLL_NOT_FOUND', async () => {
      const electionId = await seedElection('PENDING');
      await createDirectRoll(electionId, electorIds[updCode]);

      await removeElector(electionId, electorIds[updCode], adminToken).expect(204);

      const res = await removeElector(electionId, electorIds[updCode], adminToken).expect(404);

      expect(res.body).toMatchObject({ statusCode: 404, error: 'ELECTORAL_ROLL_NOT_FOUND' });
    });

    it('UD5: a CREATED election is rejected with 409 ELECTION_NOT_MODIFIABLE', async () => {
      const electionId = await seedElection('CREATED');
      await createDirectRoll(electionId, electorIds[updCode]);

      const res = await removeElector(electionId, electorIds[updCode], adminToken).expect(409);

      expect(res.body).toMatchObject({ statusCode: 409, error: 'ELECTION_NOT_MODIFIABLE' });
    });

    it.each(['PUBLISHED', 'ACTIVE', 'CLOSED'])(
      'UD6: a %s election is rejected with 409 ELECTION_NOT_MODIFIABLE',
      async (status) => {
        const electionId = await seedElection(status as SeedStatus);
        await createDirectRoll(electionId, electorIds[updCode]);

        const res = await removeElector(electionId, electorIds[updCode], adminToken).expect(409);

        expect(res.body).toMatchObject({ statusCode: 409, error: 'ELECTION_NOT_MODIFIABLE' });
      },
    );

    it('UD7: a nonexistent election returns 404 ELECTION_NOT_FOUND', async () => {
      const res = await removeElector(
        '00000000-0000-4000-8000-000000000000',
        electorIds[updCode],
        adminToken,
      ).expect(404);

      expect(res.body).toMatchObject({ statusCode: 404, error: 'ELECTION_NOT_FOUND' });
    });

    it('UD8: a nonexistent elector returns 404 ELECTOR_NOT_FOUND', async () => {
      const electionId = await seedElection('PENDING');

      const res = await removeElector(
        electionId,
        '00000000-0000-4000-8000-000000000000',
        adminToken,
      ).expect(404);

      expect(res.body).toMatchObject({ statusCode: 404, error: 'ELECTOR_NOT_FOUND' });
    });

    it('UD9: without an association returns 404 ELECTORAL_ROLL_NOT_FOUND', async () => {
      const electionId = await seedElection('PENDING');

      const res = await removeElector(electionId, electorIds[updCode], adminToken).expect(404);

      expect(res.body).toMatchObject({ statusCode: 404, error: 'ELECTORAL_ROLL_NOT_FOUND' });
    });

    it('UD10: nothing is audited for a rejected delete', async () => {
      const electionId = await seedElection('PUBLISHED');
      await createDirectRoll(electionId, electorIds[updCode]);

      await removeElector(electionId, electorIds[updCode], adminToken).expect(409);

      const audit = await prisma.auditLog.findMany({
        where: { user_id: adminUser.id, action: 'ELECTORAL_ROLL_ELECTOR_REMOVED' },
      });
      const matching = audit
        .map((entry) => JSON.parse(entry.details ?? '{}') as Record<string, unknown>)
        .filter((details) => details.electionId === electionId);
      expect(matching).toHaveLength(0);
    });
  });

  describe('Audit', () => {
    it('UB1: an ELECTORAL_ROLL_ELECTOR_UPDATED audit entry is written', async () => {
      const electionId = await seedElection('PENDING');
      await createDirectRoll(electionId, electorIds[updCode]);

      await patchElector(
        electionId,
        electorIds[updCode],
        { firstName: 'Maria' },
        adminToken,
      ).expect(200);

      const audit = await prisma.auditLog.findMany({
        where: { user_id: adminUser.id, action: 'ELECTORAL_ROLL_ELECTOR_UPDATED' },
      });
      const matching = audit
        .map((entry) => ({
          entry,
          details: JSON.parse(entry.details ?? '{}') as Record<string, unknown>,
        }))
        .filter(
          ({ details }) =>
            details.electionId === electionId && details.electorId === electorIds[updCode],
        );

      expect(matching).toHaveLength(1);
    });

    it('UB2: no update audit is written for a rejected update', async () => {
      const electionId = await seedElection('CREATED');
      await createDirectRoll(electionId, electorIds[updCode]);

      await patchElector(
        electionId,
        electorIds[updCode],
        { firstName: 'Maria' },
        adminToken,
      ).expect(409);

      const audit = await prisma.auditLog.findMany({
        where: { user_id: adminUser.id, action: 'ELECTORAL_ROLL_ELECTOR_UPDATED' },
      });
      const matching = audit
        .map((entry) => JSON.parse(entry.details ?? '{}') as Record<string, unknown>)
        .filter((details) => details.electionId === electionId);
      expect(matching).toHaveLength(0);
    });

    it('UB3: an ELECTORAL_ROLL_ELECTOR_REMOVED audit entry is written', async () => {
      const electionId = await seedElection('PENDING');
      await createDirectRoll(electionId, electorIds[updCode]);

      await removeElector(electionId, electorIds[updCode], adminToken).expect(204);

      const audit = await prisma.auditLog.findMany({
        where: { user_id: adminUser.id, action: 'ELECTORAL_ROLL_ELECTOR_REMOVED' },
      });
      const matching = audit
        .map((entry) => ({
          entry,
          details: JSON.parse(entry.details ?? '{}') as Record<string, unknown>,
        }))
        .filter(
          ({ details }) =>
            details.electionId === electionId && details.electorId === electorIds[updCode],
        );

      expect(matching).toHaveLength(1);
    });
  });

  describe('Swagger / OpenAPI', () => {
    it('US1-US9: the generated OpenAPI document documents the modification endpoints', () => {
      const config = new DocumentBuilder()
        .setTitle('Votium API')
        .setDescription('Electronic voting system API')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
      const document = SwaggerModule.createDocument(app, config);

      // US1: the path exists with both patch and delete operations.
      const pathKey = Object.keys(document.paths).find((p) =>
        p.endsWith('/electoral-rolls/{electionId}/electors/{electorId}'),
      );
      expect(pathKey).toBeDefined();
      const pathItem = document.paths[pathKey!] as {
        patch?: SwaggerOperationShape;
        delete?: SwaggerOperationShape;
      };
      expect(pathItem.patch).toBeDefined();
      expect(pathItem.delete).toBeDefined();

      // US2: both operations are grouped under the electoral-rolls tag.
      expect(pathItem.patch!.tags).toContain('electoral-rolls');
      expect(pathItem.delete!.tags).toContain('electoral-rolls');

      // US3: both path parameters are documented as required.
      for (const operation of [pathItem.patch!, pathItem.delete!]) {
        expect(operation.parameters).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ name: 'electionId', in: 'path', required: true }),
            expect.objectContaining({ name: 'electorId', in: 'path', required: true }),
          ]),
        );
      }

      // US4: authentication is documented at the operation level.
      expect(pathItem.patch!.security).toEqual([{ bearer: [] }]);
      expect(pathItem.delete!.security).toEqual([{ bearer: [] }]);
      expect(document.components?.securitySchemes?.bearer).toBeDefined();

      // US5: the PATCH request body references the update DTO.
      expect(pathItem.patch!.requestBody).toBeDefined();
      const requestSchemaRef = pathItem.patch!.requestBody!.content['application/json'].schema.$ref;
      expect(requestSchemaRef).toBe('#/components/schemas/UpdateElectoralRollElectorDto');
      const requestSchema = document.components?.schemas?.['UpdateElectoralRollElectorDto'] as
        | { properties?: Record<string, unknown> }
        | undefined;
      expect(requestSchema).toBeDefined();
      expect(requestSchema!.properties?.firstName).toBeDefined();
      expect(requestSchema!.properties?.lastName).toBeDefined();
      expect(requestSchema!.properties?.email).toBeDefined();
      expect(requestSchema!.properties?.studentCode).toBeDefined();
      expect(requestSchema!.properties?.programCode).toBeDefined();

      // US9: the schema exposes exactly the 5 editable fields and no immutable ones.
      const editable = ['firstName', 'lastName', 'email', 'studentCode', 'programCode'];
      expect(Object.keys(requestSchema!.properties ?? {}).sort()).toEqual(editable.slice().sort());
      for (const forbidden of ['status', 'passwordHash', 'id', 'createdAt']) {
        expect(requestSchema!.properties?.[forbidden]).toBeUndefined();
      }

      // US6: the PATCH success and error responses are documented.
      expect(pathItem.patch!.responses['200']).toBeDefined();
      expect(pathItem.patch!.responses['400']).toBeDefined();
      expect(pathItem.patch!.responses['401']).toBeDefined();
      expect(pathItem.patch!.responses['403']).toBeDefined();
      expect(pathItem.patch!.responses['404']).toBeDefined();
      expect(pathItem.patch!.responses['409']).toBeDefined();

      // US7 + US8: the DELETE responses are documented, including 204.
      expect(pathItem.delete!.responses['204']).toBeDefined();
      expect(pathItem.delete!.responses['400']).toBeDefined();
      expect(pathItem.delete!.responses['401']).toBeDefined();
      expect(pathItem.delete!.responses['403']).toBeDefined();
      expect(pathItem.delete!.responses['404']).toBeDefined();
      expect(pathItem.delete!.responses['409']).toBeDefined();
    });
  });
});
