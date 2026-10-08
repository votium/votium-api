import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
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

interface SwaggerOperationShape {
  tags?: string[];
  parameters?: Array<{ name: string; in: string; required?: boolean }>;
  security?: Array<{ cookie: string[] }>;
  requestBody?: {
    required?: boolean;
    content: Record<string, { schema: { $ref?: string } }>;
  };
  responses: Record<string, { content: Record<string, { schema: { $ref?: string } }> }>;
}

describe('Elections creation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let emailService: FakeEmailService;

  let adminUser: { id: string; email: string; password: string };
  let auditorUser: { id: string; email: string; password: string };

  const suffix = Date.now();
  const usedNames: string[] = [];

  let adminToken = '';
  let auditorToken = '';

  const validElection = (name: string): Record<string, unknown> => ({
    name,
    description: 'Election for the 2026 student council.',
    startDate: '2026-10-01',
    startTime: '08:00:00',
    endDate: '2026-10-01',
    endTime: '18:00:00',
    blankVoteEnabled: false,
  });

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

  const createElection = (payload: Record<string, unknown>, token: string) =>
    request(app.getHttpServer()).post('/api/v1/elections').set('Cookie', token).send(payload);

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
    const hash = (pwd: string) => hasher.hash(pwd);
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
      email: `e2e-election-admin-${suffix}@example.com`,
      password: 'SuperSecret123!',
    };
    auditorUser = {
      id: '',
      email: `e2e-election-auditor-${suffix}@example.com`,
      password: 'SuperSecret123!',
    };

    const createdAdmin = await prisma.user.create({
      data: {
        first_name: 'E2E',
        last_name: 'Admin',
        email: adminUser.email,
        password_hash: await hash(adminUser.password),
        role_id: adminRole.id,
        status: UserStatus.ACTIVE.value,
      },
    });
    const createdAuditor = await prisma.user.create({
      data: {
        first_name: 'E2E',
        last_name: 'Auditor',
        email: auditorUser.email,
        password_hash: await hash(auditorUser.password),
        role_id: auditorRole.id,
        status: UserStatus.ACTIVE.value,
      },
    });
    adminUser.id = createdAdmin.id;
    auditorUser.id = createdAuditor.id;

    adminToken = await completeLogin(adminUser.email, adminUser.password);
    auditorToken = await completeLogin(auditorUser.email, auditorUser.password);
  });

  afterAll(async () => {
    if (usedNames.length > 0) {
      await prisma.election.deleteMany({ where: { name: { in: usedNames } } });
    }
    const ids = [adminUser.id, auditorUser.id];
    await prisma.mfaChallenge.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  describe('POST /elections', () => {
    it('E1: an authenticated administrator creates an election with 201', async () => {
      const name = `ELECTION-${suffix}`;
      usedNames.push(name);
      const res = await createElection(validElection(name), adminToken).expect(201);
      expect(res.body).toMatchObject({
        name,
        description: 'Election for the 2026 student council.',
        currentStatus: 'PENDING',
        blankVoteEnabled: false,
      });
    });

    it('E2: the response represents the created election without extra fields', async () => {
      const name = `ELECTION2-${suffix}`;
      usedNames.push(name);
      const res = await createElection(validElection(name), adminToken).expect(201);
      const body = res.body as Record<string, unknown>;
      expect(body.id).toBeTruthy();
      expect(body.currentStatus).toBe('PENDING');
      expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
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

    it('E3: the election exists in the database with the correct values', async () => {
      const name = `ELECTION3-${suffix}`;
      usedNames.push(name);
      const res = await createElection(validElection(name), adminToken).expect(201);
      const body = res.body as Record<string, unknown>;
      const row = await prisma.election.findUnique({ where: { name } });
      expect(row).not.toBeNull();
      expect(row!.id).toBe(body.id);
      expect(row!.name).toBe(name);
      expect(row!.current_status).toBe('PENDING');
      expect(row!.blank_vote_enabled).toBe(false);
      expect(row!.created_at).toBeInstanceOf(Date);
    });

    it('E4: rejects unauthenticated requests with 401', async () => {
      await createElection(validElection(`NOAUTH-${suffix}`), '').expect(401);
    });

    it('E5: rejects an invalid token with 401', async () => {
      const res = await createElection(
        validElection(`BADTOKEN-${suffix}`),
        'not-a-real-token',
      ).expect(401);
      expect(res.body).toMatchObject({ statusCode: 401 });
    });

    it('E6: rejects a non-admin role with 403', async () => {
      const res = await createElection(validElection(`AUDITOR-${suffix}`), auditorToken).expect(
        403,
      );
      expect(res.body).toMatchObject({ statusCode: 403 });
    });

    it('E7: rejects a missing required field with 400', async () => {
      const payload: Record<string, unknown> = { ...validElection(`MISSING-${suffix}`) };
      delete payload.name;
      const res = await createElection(payload, adminToken).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E8: rejects an empty required value with 400', async () => {
      const payload: Record<string, unknown> = { ...validElection(`EMPTY-${suffix}`) };
      payload.name = '';
      const res = await createElection(payload, adminToken).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E9: rejects whitespace-only name with 400', async () => {
      const payload: Record<string, unknown> = { ...validElection(`WS-${suffix}`) };
      payload.name = '   ';
      const res = await createElection(payload, adminToken).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E10: rejects an invalid start date with 400', async () => {
      const payload: Record<string, unknown> = { ...validElection(`BADDATE-${suffix}`) };
      payload.startDate = '2026-13-40';
      const res = await createElection(payload, adminToken).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E11: rejects an invalid start time with 400', async () => {
      const payload: Record<string, unknown> = { ...validElection(`BADTIME-${suffix}`) };
      payload.startTime = '25:00:00';
      const res = await createElection(payload, adminToken).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E12: rejects an equal start/end date-time with 400', async () => {
      const payload: Record<string, unknown> = { ...validElection(`EQUAL-${suffix}`) };
      payload.endDate = '2026-10-01';
      payload.endTime = '08:00:00';
      const res = await createElection(payload, adminToken).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E13: rejects a start date-time after end with 400', async () => {
      const payload: Record<string, unknown> = { ...validElection(`AFTER-${suffix}`) };
      payload.endDate = '2026-09-30';
      payload.endTime = '08:00:00';
      const res = await createElection(payload, adminToken).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E14: rejects a non-boolean blank_vote_enabled with 400', async () => {
      const payload: Record<string, unknown> = { ...validElection(`BOOL-${suffix}`) };
      payload.blankVoteEnabled = 'true';
      const res = await createElection(payload, adminToken).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E15: rejects a client-supplied id with 400', async () => {
      const payload: Record<string, unknown> = { ...validElection(`ID-${suffix}`) };
      payload.id = '00000000-0000-0000-0000-000000000000';
      const res = await createElection(payload, adminToken).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E16: rejects a client-supplied currentStatus with 400', async () => {
      const payload: Record<string, unknown> = { ...validElection(`STATUS-${suffix}`) };
      payload.currentStatus = 'ACTIVE';
      const res = await createElection(payload, adminToken).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E17: rejects a client-supplied created_at with 400', async () => {
      const payload: Record<string, unknown> = { ...validElection(`CREATED-${suffix}`) };
      payload.createdAt = '2026-01-01T00:00:00.000Z';
      const res = await createElection(payload, adminToken).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E18: rejects a duplicate election name with 409 and does not overwrite', async () => {
      const name = `DUP-${suffix}`;
      usedNames.push(name);
      await createElection(validElection(name), adminToken).expect(201);
      const res = await createElection(validElection(name), adminToken).expect(409);
      expect(res.body).toMatchObject({ statusCode: 409, error: 'ELECTION_NAME_CONFLICT' });
      const rows = await prisma.election.findMany({ where: { name } });
      expect(rows).toHaveLength(1);
    });

    it('E19: failed requests do not create unrelated records', async () => {
      const failedNames = [`FAIL-${suffix}`, `UNAUTH-${suffix}`, `FORBID-${suffix}`];
      const before = await prisma.election.count({ where: { name: { in: failedNames } } });
      await createElection({ ...validElection(`FAIL-${suffix}`), name: '' }, adminToken).expect(
        400,
      );
      await createElection(validElection(`UNAUTH-${suffix}`), '').expect(401);
      await createElection(validElection(`FORBID-${suffix}`), auditorToken).expect(403);
      const after = await prisma.election.count({ where: { name: { in: failedNames } } });
      expect(after).toBe(before);
    });
  });

  describe('PUT /elections/:id', () => {
    const putElection = (id: string, payload: Record<string, unknown>, token: string) =>
      request(app.getHttpServer())
        .put(`/api/v1/elections/${id}`)
        .set('Cookie', token)
        .send(payload);

    const patchElection = (id: string, payload: Record<string, unknown>, token: string) =>
      request(app.getHttpServer())
        .patch(`/api/v1/elections/${id}`)
        .set('Cookie', token)
        .send(payload);

    const createElectionAndGetId = async (name: string, token: string): Promise<string> => {
      const res = await createElection(validElection(name), token).expect(201);
      return (res.body as { id: string }).id;
    };

    const validUpdate = (name: string): Record<string, unknown> => ({
      name,
      description: 'Updated election for the 2026 student council.',
      startDate: '2026-10-01',
      startTime: '08:00:00',
      endDate: '2026-10-01',
      endTime: '18:00:00',
      blankVoteEnabled: false,
    });

    let editableId = '';
    let editableName = '';

    beforeAll(async () => {
      editableName = `PUT-${suffix}`;
      usedNames.push(editableName);
      editableId = await createElectionAndGetId(editableName, adminToken);
    });

    it('U-01: ADMIN updates a PENDING election with 200', async () => {
      const res = await putElection(editableId, validUpdate(editableName), adminToken).expect(200);
      const body = res.body as { name: string; description: string; currentStatus: string };
      expect(body.name).toBe(editableName);
      expect(body.description).toBe('Updated election for the 2026 student council.');
      expect(body.currentStatus).toBe('PENDING');
    });

    it('U-02: the old PATCH route is no longer registered (404)', async () => {
      await patchElection(editableId, validUpdate(editableName), adminToken).expect(404);
    });

    it('U-03: a complete update changes all configurable fields', async () => {
      const res = await putElection(
        editableId,
        {
          ...validUpdate(editableName),
          description: 'Complete update.',
          startDate: '2026-10-02',
          startTime: '09:00:00',
          endDate: '2026-10-02',
          endTime: '20:00:00',
        },
        adminToken,
      ).expect(200);
      const body = res.body as Record<string, unknown>;
      expect(body.description).toBe('Complete update.');
      expect(body.startDate).toBe('2026-10-02');
      expect(body.startTime).toBe('09:00:00');
      expect(body.endDate).toBe('2026-10-02');
      expect(body.endTime).toBe('20:00:00');
    });

    it('U-04: the response matches the election response contract', async () => {
      const res = await putElection(editableId, validUpdate(editableName), adminToken).expect(200);
      const body = res.body as Record<string, unknown>;
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

    it('U-05: a non-UUID id is rejected with 400', async () => {
      await putElection('not-a-uuid', validUpdate(editableName), adminToken).expect(400);
    });

    it('U-06: a valid UUID that does not exist is rejected with 404', async () => {
      const res = await putElection(
        '00000000-0000-0000-0000-000000000000',
        validUpdate(editableName),
        adminToken,
      ).expect(404);
      expect(res.body).toMatchObject({ statusCode: 404, error: 'ELECTION_NOT_FOUND' });
    });

    it('U-07: a missing required field is rejected with 400', async () => {
      const payload = validUpdate(editableName);
      delete payload.startDate;
      await putElection(editableId, payload, adminToken).expect(400);
    });

    it('U-08: omitting blankVoteEnabled is accepted and keeps false', async () => {
      const payload = validUpdate(editableName);
      delete payload.blankVoteEnabled;
      const res = await putElection(editableId, payload, adminToken).expect(200);
      expect((res.body as { blankVoteEnabled: boolean }).blankVoteEnabled).toBe(false);
    });

    it('U-09: a client-supplied id is rejected with 400', async () => {
      await putElection(
        editableId,
        { ...validUpdate(editableName), id: '00000000-0000-0000-0000-000000000000' },
        adminToken,
      ).expect(400);
    });

    it('U-10: a client-supplied currentStatus is rejected with 400', async () => {
      await putElection(
        editableId,
        { ...validUpdate(editableName), currentStatus: 'ACTIVE' },
        adminToken,
      ).expect(400);
    });

    it('U-11: an election in a non-editable state is rejected with 409', async () => {
      const name = `NONEDIT-${suffix}`;
      usedNames.push(name);
      const id = await createElectionAndGetId(name, adminToken);
      await prisma.election.update({ where: { id }, data: { current_status: 'CREATED' } });
      const res = await putElection(id, validUpdate(name), adminToken).expect(409);
      expect(res.body).toMatchObject({ statusCode: 409, error: 'ELECTION_NOT_EDITABLE' });
    });

    it('U-12: unauthenticated request is rejected with 401', async () => {
      await putElection(editableId, validUpdate(editableName), '').expect(401);
    });

    it('U-13: an invalid token is rejected with 401', async () => {
      await putElection(editableId, validUpdate(editableName), 'not-a-real-token').expect(401);
    });

    it('U-14: a non-admin role (AUDITOR) is rejected with 403', async () => {
      await putElection(editableId, validUpdate(editableName), auditorToken).expect(403);
    });

    it('U-15: an invalid startDate is rejected with 400', async () => {
      await putElection(
        editableId,
        { ...validUpdate(editableName), startDate: '2026-13-40' },
        adminToken,
      ).expect(400);
    });

    it('U-16: an invalid startTime is rejected with 400', async () => {
      await putElection(
        editableId,
        { ...validUpdate(editableName), startTime: '25:00:00' },
        adminToken,
      ).expect(400);
    });

    it('U-17: an invalid interval (end == start) is rejected with 400', async () => {
      const res = await putElection(
        editableId,
        { ...validUpdate(editableName), endTime: '08:00:00' },
        adminToken,
      ).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400, error: 'ELECTION_INVALID_DATE_RANGE' });
    });

    it('U-18: a non-boolean blankVoteEnabled is rejected with 400', async () => {
      await putElection(
        editableId,
        { ...validUpdate(editableName), blankVoteEnabled: 'true' },
        adminToken,
      ).expect(400);
    });

    it('U-19: renaming to an existing election name is rejected with 409', async () => {
      const other = `OTHER-${suffix}`;
      usedNames.push(other);
      await createElectionAndGetId(other, adminToken);
      const res = await putElection(
        editableId,
        { ...validUpdate(editableName), name: other },
        adminToken,
      ).expect(409);
      expect(res.body).toMatchObject({ statusCode: 409, error: 'ELECTION_NAME_CONFLICT' });
    });

    it('U-20: renaming to its own current name succeeds (self excluded)', async () => {
      await putElection(editableId, validUpdate(editableName), adminToken).expect(200);
    });

    it('U-21: a successful edit persists the configurable values', async () => {
      await putElection(
        editableId,
        { ...validUpdate(editableName), description: 'Persisted.' },
        adminToken,
      ).expect(200);
      const row = await prisma.election.findUnique({ where: { id: editableId } });
      expect(row!.description).toBe('Persisted.');
    });

    it('U-22: a successful edit does not alter currentStatus or createdAt', async () => {
      const before = await prisma.election.findUnique({ where: { id: editableId } });
      await putElection(editableId, validUpdate(editableName), adminToken).expect(200);
      const after = await prisma.election.findUnique({ where: { id: editableId } });
      expect(after!.current_status).toBe(before!.current_status);
      expect(after!.created_at.toISOString()).toBe(before!.created_at.toISOString());
    });
  });

  describe('Swagger / OpenAPI', () => {
    const buildDocument = () => {
      const config = new DocumentBuilder()
        .setTitle('Votium API')
        .setDescription('Electronic voting system API')
        .setVersion('1.0')
        .addCookieAuth(envs.authCookieName)
        .build();
      return SwaggerModule.createDocument(app, config);
    };

    const findUpdatePath = (document: ReturnType<typeof buildDocument>) =>
      Object.keys(document.paths).find(
        (p) =>
          p.endsWith('/elections/{id}') && !p.includes('/start') && !p.includes('/candidacies'),
      );

    it('SW-01: the update operation is exposed as PUT and PATCH is removed', () => {
      const document = buildDocument();
      const pathKey = findUpdatePath(document);
      expect(pathKey).toBeDefined();
      expect(document.paths[pathKey!].put).toBeDefined();
      expect(document.paths[pathKey!].patch).toBeUndefined();
    });

    it('SW-02: PUT is tagged elections and cookie-secured', () => {
      const document = buildDocument();
      const pathKey = findUpdatePath(document);
      const operation = document.paths[pathKey!].put as unknown as SwaggerOperationShape;
      expect(operation.tags).toContain('elections');
      expect(operation.security).toEqual([{ cookie: [] }]);
    });

    it('SW-03: the request schema marks the six configurable fields as required', () => {
      const document = buildDocument();
      const pathKey = findUpdatePath(document);
      const operation = document.paths[pathKey!].put as unknown as SwaggerOperationShape;
      const ref = operation.requestBody!.content['application/json'].schema.$ref;
      expect(ref).toBe('#/components/schemas/UpdateElectionDto');
      const schema = document.components?.schemas?.['UpdateElectionDto'] as
        | { required?: string[]; properties?: Record<string, unknown> }
        | undefined;
      expect(schema).toBeDefined();
      expect(schema!.required).toEqual(
        expect.arrayContaining([
          'name',
          'description',
          'startDate',
          'startTime',
          'endDate',
          'endTime',
        ]),
      );
      expect(schema!.required).not.toContain('blankVoteEnabled');
    });

    it('SW-04: the request schema excludes system-managed fields', () => {
      const document = buildDocument();
      const schema = document.components?.schemas?.['UpdateElectionDto'] as
        | { properties?: Record<string, unknown> }
        | undefined;
      expect(schema).toBeDefined();
      for (const forbidden of ['id', 'currentStatus', 'createdAt']) {
        expect(schema!.properties?.[forbidden]).toBeUndefined();
      }
    });

    it('SW-05: the id path parameter and error responses are documented', () => {
      const document = buildDocument();
      const pathKey = findUpdatePath(document);
      const operation = document.paths[pathKey!].put as unknown as SwaggerOperationShape;
      expect(operation.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'id', in: 'path', required: true }),
        ]),
      );
      for (const status of ['200', '400', '401', '403', '404', '409']) {
        expect(operation.responses[status]).toBeDefined();
      }
    });
  });

  describe('DELETE /elections/:id', () => {
    const deleteElection = (id: string, token: string) =>
      request(app.getHttpServer()).delete(`/api/v1/elections/${id}`).set('Cookie', token);

    const createElectionAndGetId = async (name: string): Promise<string> => {
      const res = await createElection(validElection(name), adminToken).expect(201);
      return (res.body as { id: string }).id;
    };

    const seededCandidateIds: string[] = [];
    const seededVoteIds: string[] = [];

    async function seedCandidacy(electionId: string): Promise<void> {
      const candidate = await prisma.candidate.create({
        data: {
          first_name: 'E2E',
          last_name: 'Candidate',
          student_code: `SC-${suffix}-${Math.random()}`,
          program_code: 'PC',
          identification_number: `ID-${suffix}-${Math.random()}`,
          status: 'ACTIVE',
        },
      });
      seededCandidateIds.push(candidate.id);
      await prisma.candiday.create({
        data: { candidate_id: candidate.id, election_id: electionId, position_number: 1 },
      });
    }

    async function seedVote(electionId: string): Promise<void> {
      const vote = await prisma.voteMetadata.create({
        data: { election_id: electionId, tx_hash: `0x${suffix}-${Math.random()}` },
      });
      seededVoteIds.push(vote.id);
    }

    afterAll(async () => {
      await prisma.voteMetadata.deleteMany({ where: { id: { in: seededVoteIds } } });
      await prisma.candiday.deleteMany({ where: { candidate_id: { in: seededCandidateIds } } });
      await prisma.candidate.deleteMany({ where: { id: { in: seededCandidateIds } } });
    });

    it('D1: ADMIN deletes an eligible CREATED election with 204 and removes the row', async () => {
      const name = `DEL-OK-${suffix}`;
      usedNames.push(name);
      const id = await createElectionAndGetId(name);

      await deleteElection(id, adminToken).expect(204);

      expect(await prisma.election.findUnique({ where: { id } })).toBeNull();
    });

    it('D2: unauthenticated request is rejected with 401', async () => {
      const id = await createElectionAndGetId(`DEL-UNAUTH-${suffix}`);
      await deleteElection(id, '').expect(401);
    });

    it('D3: an invalid token is rejected with 401', async () => {
      const id = await createElectionAndGetId(`DEL-BADTOKEN-${suffix}`);
      await deleteElection(id, 'not-a-real-token').expect(401);
    });

    it('D4: a non-admin role (AUDITOR) is rejected with 403 and the election remains', async () => {
      const name = `DEL-AUDITOR-${suffix}`;
      usedNames.push(name);
      const id = await createElectionAndGetId(name);

      await deleteElection(id, auditorToken).expect(403);
      expect(await prisma.election.findUnique({ where: { id } })).not.toBeNull();
    });

    it('D5: a non-UUID id is rejected with 400', async () => {
      await deleteElection('not-a-uuid', adminToken).expect(400);
    });

    it('D6: a valid UUID that does not exist is rejected with 404', async () => {
      const res = await deleteElection('00000000-0000-0000-0000-000000000000', adminToken).expect(
        404,
      );
      expect(res.body).toMatchObject({ statusCode: 404, error: 'ELECTION_NOT_FOUND' });
    });

    it('D7: a non-deletable election state is rejected with 409 and the row is unchanged', async () => {
      const name = `DEL-NONPEND-${suffix}`;
      usedNames.push(name);
      const id = await createElectionAndGetId(name);
      await prisma.election.update({ where: { id }, data: { current_status: 'CREATED' } });

      const res = await deleteElection(id, adminToken).expect(409);
      expect(res.body).toMatchObject({ statusCode: 409, error: 'ELECTION_NOT_DELETABLE' });
      expect((await prisma.election.findUnique({ where: { id } }))!.current_status).toBe('CREATED');
    });

    it('D8: an election with candidates is rejected with 409 and the row is unchanged', async () => {
      const name = `DEL-CAND-${suffix}`;
      usedNames.push(name);
      const id = await createElectionAndGetId(name);
      await seedCandidacy(id);

      const res = await deleteElection(id, adminToken).expect(409);
      expect(res.body).toMatchObject({ statusCode: 409, error: 'ELECTION_HAS_CANDIDATES' });
      expect(await prisma.election.findUnique({ where: { id } })).not.toBeNull();
    });

    it('D9: an election with votes is rejected with 409 and the row is unchanged', async () => {
      const name = `DEL-VOTE-${suffix}`;
      usedNames.push(name);
      const id = await createElectionAndGetId(name);
      await seedVote(id);

      const res = await deleteElection(id, adminToken).expect(409);
      expect(res.body).toMatchObject({ statusCode: 409, error: 'ELECTION_HAS_VOTES' });
      expect(await prisma.election.findUnique({ where: { id } })).not.toBeNull();
    });
  });

  describe('GET /elections', () => {
    const now = new Date();
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * 86_400_000);
    const nextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
    const toDateStr = (d: Date): string =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
        d.getUTCDate(),
      ).padStart(2, '0')}`;

    type ElectionSeedOverrides = {
      start_date?: Date;
      start_time?: Date;
      end_date?: Date;
      end_time?: Date;
      current_status?: ElectionStatus;
      blank_vote_enabled?: boolean;
    };

    // Seeds directly via Prisma (bypassing the API) so dates can be relative to "now".
    // Default seed is a wide schedule-active window: yesterday 00:00 → tomorrow 23:59 (UTC).
    async function seedElection(name: string, over: ElectionSeedOverrides = {}): Promise<void> {
      usedNames.push(name);
      await prisma.election.create({
        data: {
          name,
          description: 'E2E query seed.',
          start_date: addDays(today, -1),
          start_time: new Date(Date.UTC(1970, 0, 1, 0, 0, 0)),
          end_date: addDays(today, 1),
          end_time: new Date(Date.UTC(1970, 0, 1, 23, 59, 59)),
          current_status: 'PENDING',
          blank_vote_enabled: false,
          ...over,
        },
      });
    }

    const getElections = (token: string, query = '') =>
      request(app.getHttpServer()).get(`/api/v1/elections${query}`).set('Cookie', token);

    it('Q1: an authenticated ADMIN can query elections and receives the response contract', async () => {
      await seedElection(`Q1-ACTIVE-${suffix}`);

      const res = await getElections(adminToken).expect(200);
      const body = res.body as {
        data: Array<Record<string, unknown>>;
        meta: { page: number; limit: number; total: number; totalPages: number };
      };
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
      expect(Object.keys(body.meta).sort()).toEqual(
        ['limit', 'page', 'total', 'totalPages'].sort(),
      );
      expect(body.meta.limit).toBe(10);
      expect(body.meta.page).toBe(1);
      for (const item of body.data) {
        expect(Object.keys(item).sort()).toEqual(
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
      }
    });

    it('Q2: an authenticated AUDITOR can query elections with 200', async () => {
      await getElections(auditorToken).expect(200);
    });

    it('Q3: an unauthenticated request is rejected with 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/elections').expect(401);
    });

    it('Q4: an invalid token is rejected with 401', async () => {
      const res = await getElections('not-a-real-token').expect(401);
      expect(res.body).toMatchObject({ statusCode: 401 });
    });

    // Q5 (403 for a third role) is deliberately skipped: both allowed roles
    // (ADMINISTRATOR, AUDITOR) are exercised above, the endpoint has no third-role
    // fixture, and 403 behavior is already covered by other endpoints. Documented in
    // the test design (plans/task-96-elections-query-endpoint-tests.spec.md).

    it('Q6: the default request returns only schedule-active elections', async () => {
      const active = `Q6-ACTIVE-${suffix}`;
      const future = `Q6-FUTURE-${suffix}`;
      const past = `Q6-PAST-${suffix}`;
      await seedElection(active);
      await seedElection(future, {
        start_date: addDays(nextMonth, 15),
        start_time: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        end_date: addDays(nextMonth, 30),
        end_time: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
      });
      await seedElection(past, {
        start_date: addDays(today, -2),
        end_date: addDays(today, -1),
        end_time: new Date(Date.UTC(1970, 0, 1, 0, 0, 0)),
      });

      const res = await getElections(adminToken).expect(200);
      const body = res.body as { data: Array<{ name: string }>; meta: { total: number } };
      const names = body.data.map((e) => e.name);
      expect(names).toContain(active);
      expect(names).not.toContain(future);
      expect(names).not.toContain(past);
      expect(body.meta.total).toBeGreaterThanOrEqual(1);
    });

    it('Q7: the status filter works independently of the active default', async () => {
      const pending = `Q7-${suffix}-PENDING`;
      const created = `Q7-${suffix}-CREATED`;
      await seedElection(pending);
      await seedElection(created, { current_status: 'CREATED' });

      const res = await getElections(adminToken, `?name=Q7-${suffix}&status=PENDING`).expect(200);
      const names = (res.body as { data: Array<{ name: string }> }).data.map((e) => e.name);
      expect(names).toEqual([pending]);
    });

    it('Q8: the name filter is partial and case-insensitive', async () => {
      const active = `Q8-${suffix}-QUERY-ACTIVE`;
      const future = `Q8-${suffix}-query-FUTURE`;
      await seedElection(active);
      await seedElection(future, {
        start_date: addDays(nextMonth, 15),
        end_date: addDays(nextMonth, 30),
      });

      const res = await getElections(adminToken, `?name=Q8-${suffix}`).expect(200);
      const names = (res.body as { data: Array<{ name: string }> }).data.map((e) => e.name);
      expect(names).toContain(active);
      expect(names).not.toContain(future);
    });

    it('Q9: the startDate filter limits to elections starting on/after the date', async () => {
      const early = `Q9-${suffix}-EARLY`;
      const late = `Q9-${suffix}-LATE`;
      await seedElection(early);
      await seedElection(late, {
        start_date: nextMonth,
        start_time: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        end_date: addDays(nextMonth, 30),
        end_time: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
      });

      const res = await getElections(
        adminToken,
        `?name=Q9-${suffix}&status=PENDING&startDate=${toDateStr(nextMonth)}`,
      ).expect(200);
      const names = (res.body as { data: Array<{ name: string }> }).data.map((e) => e.name);
      expect(names).toEqual([late]);
    });

    it('Q10: the endDate filter limits to elections ending on/before the date', async () => {
      const early = `Q10-${suffix}-EARLY`;
      const late = `Q10-${suffix}-LATE`;
      await seedElection(early);
      await seedElection(late, {
        start_date: nextMonth,
        end_date: addDays(nextMonth, 30),
      });

      const res = await getElections(
        adminToken,
        `?name=Q10-${suffix}&status=PENDING&endDate=${toDateStr(addDays(today, 1))}`,
      ).expect(200);
      const names = (res.body as { data: Array<{ name: string }> }).data.map((e) => e.name);
      expect(names).toEqual([early]);
    });

    it('Q11: combined filters return only elections matching every condition', async () => {
      const match = `Q11-${suffix}-MATCH`;
      const decoy = `Q11-${suffix}-DECOY`;
      await seedElection(match, { current_status: 'PENDING' });
      await seedElection(decoy, {
        current_status: 'PENDING',
        start_date: addDays(nextMonth, 15),
        end_date: addDays(nextMonth, 30),
      });

      const res = await getElections(
        adminToken,
        `?name=Q11-${suffix}&status=PENDING&active=true` +
          `&startDate=${toDateStr(addDays(today, -1))}&endDate=${toDateStr(addDays(today, 1))}`,
      ).expect(200);
      const names = (res.body as { data: Array<{ name: string }> }).data.map((e) => e.name);
      expect(names).toEqual([match]);
    });

    it('Q12: active=false returns the non-active complement', async () => {
      const active = `Q12-${suffix}-ACTIVE`;
      const future = `Q12-${suffix}-FUTURE`;
      const past = `Q12-${suffix}-PAST`;
      await seedElection(active);
      await seedElection(future, {
        start_date: addDays(nextMonth, 15),
        end_date: addDays(nextMonth, 30),
      });
      await seedElection(past, {
        start_date: addDays(today, -2),
        end_date: addDays(today, -1),
      });

      const res = await getElections(adminToken, `?name=Q12-${suffix}&active=false`).expect(200);
      const names = (res.body as { data: Array<{ name: string }> }).data.map((e) => e.name);
      expect(names).toContain(future);
      expect(names).toContain(past);
      expect(names).not.toContain(active);
    });

    it('Q13a: unknown query parameters are rejected with 400', async () => {
      const res = await getElections(adminToken, '?foo=1').expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('Q13b: an invalid status value is rejected with 400', async () => {
      await getElections(adminToken, '?status=INVALID').expect(400);
    });

    it('Q13c: a malformed startDate is rejected with 400', async () => {
      const res = await getElections(adminToken, '?startDate=2026-13-40').expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('Q13d: a malformed endDate is rejected with 400', async () => {
      await getElections(adminToken, '?endDate=2026-02-30').expect(400);
    });

    it('Q13e: an invalid active value is rejected with 400', async () => {
      await getElections(adminToken, '?active=yes').expect(400);
    });

    it('Q13f: active=TRUE is rejected with 400 (only literal true/false accepted)', async () => {
      await getElections(adminToken, '?active=TRUE').expect(400);
    });

    it('Q13g: a page below the minimum is rejected with 400', async () => {
      await getElections(adminToken, '?page=0').expect(400);
    });

    it('Q13h: a non-numeric limit is rejected with 400', async () => {
      await getElections(adminToken, '?limit=abc').expect(400);
    });

    it('Q14: pagination returns the requested slice with correct meta', async () => {
      for (let i = 0; i < 3; i += 1) {
        await seedElection(`PG-${suffix}-${i}`);
      }

      const page1 = await getElections(adminToken, `?name=PG-${suffix}&limit=1&page=1`).expect(200);
      const body1 = page1.body as {
        data: Array<Record<string, unknown>>;
        meta: { page: number; limit: number; total: number; totalPages: number };
      };
      expect(body1.data).toHaveLength(1);
      expect(body1.meta).toMatchObject({ page: 1, limit: 1, total: 3, totalPages: 3 });

      const page2 = await getElections(adminToken, `?name=PG-${suffix}&limit=1&page=2`).expect(200);
      const body2 = page2.body as {
        data: Array<Record<string, unknown>>;
        meta: { page: number; limit: number; total: number; totalPages: number };
      };
      expect(body2.data).toHaveLength(1);
      expect(body2.meta).toMatchObject({ page: 2, limit: 1, total: 3, totalPages: 3 });
    });
  });
});
