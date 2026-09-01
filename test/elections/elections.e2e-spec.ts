import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
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
    return (verifyRes.body as TokensResponseBody).accessToken;
  };

  const createElection = (payload: Record<string, unknown>, token: string) =>
    request(app.getHttpServer())
      .post('/api/v1/elections')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

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
        currentStatus: 'CREATED',
        blankVoteEnabled: false,
      });
    });

    it('E2: the response represents the created election without extra fields', async () => {
      const name = `ELECTION2-${suffix}`;
      usedNames.push(name);
      const res = await createElection(validElection(name), adminToken).expect(201);
      const body = res.body as Record<string, unknown>;
      expect(body.id).toBeTruthy();
      expect(body.currentStatus).toBe('CREATED');
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
      expect(row!.current_status).toBe('CREATED');
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
      const before = await prisma.election.count();
      await createElection({ ...validElection(`FAIL-${suffix}`), name: '' }, adminToken).expect(
        400,
      );
      await createElection(validElection(`UNAUTH-${suffix}`), '').expect(401);
      await createElection(validElection(`FORBID-${suffix}`), auditorToken).expect(403);
      const after = await prisma.election.count();
      expect(after).toBe(before);
    });
  });

  describe('PATCH /elections/:id', () => {
    const patchElection = (id: string, payload: Record<string, unknown>, token: string) =>
      request(app.getHttpServer())
        .patch(`/api/v1/elections/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send(payload);

    const createElectionAndGetId = async (name: string, token: string): Promise<string> => {
      const res = await createElection(validElection(name), token).expect(201);
      return (res.body as { id: string }).id;
    };

    let editableId = '';
    let editableName = '';

    beforeAll(async () => {
      editableName = `PATCH-${suffix}`;
      usedNames.push(editableName);
      editableId = await createElectionAndGetId(editableName, adminToken);
    });

    it('P1: ADMIN edits a CREATED election with 200 and preserves omitted fields', async () => {
      const res = await patchElection(editableId, { description: 'Updated.' }, adminToken).expect(
        200,
      );
      const body = res.body as { name: string; description: string; currentStatus: string };
      expect(body.name).toBe(editableName);
      expect(body.description).toBe('Updated.');
      expect(body.currentStatus).toBe('CREATED');
    });

    it('P2: unauthenticated request is rejected with 401', async () => {
      await patchElection(editableId, { description: 'x' }, '').expect(401);
    });

    it('P3: an invalid token is rejected with 401', async () => {
      await patchElection(editableId, { description: 'x' }, 'not-a-real-token').expect(401);
    });

    it('P4: a non-admin role (AUDITOR) is rejected with 403', async () => {
      await patchElection(editableId, { description: 'x' }, auditorToken).expect(403);
    });

    it('P5: a non-UUID id is rejected with 400', async () => {
      await patchElection('not-a-uuid', { description: 'x' }, adminToken).expect(400);
    });

    it('P6: a valid UUID that does not exist is rejected with 404', async () => {
      const res = await patchElection(
        '00000000-0000-0000-0000-000000000000',
        { description: 'x' },
        adminToken,
      ).expect(404);
      expect(res.body).toMatchObject({ statusCode: 404, error: 'ELECTION_NOT_FOUND' });
    });

    it('P7: an election in a non-editable state is rejected with 409', async () => {
      const name = `NONEDIT-${suffix}`;
      usedNames.push(name);
      const id = await createElectionAndGetId(name, adminToken);
      await prisma.election.update({ where: { id }, data: { current_status: 'PENDING' } });
      const res = await patchElection(id, { description: 'x' }, adminToken).expect(409);
      expect(res.body).toMatchObject({ statusCode: 409, error: 'ELECTION_NOT_EDITABLE' });
    });

    it('P8: renaming to an existing election name is rejected with 409', async () => {
      const other = `OTHER-${suffix}`;
      usedNames.push(other);
      await createElectionAndGetId(other, adminToken);
      const res = await patchElection(editableId, { name: other }, adminToken).expect(409);
      expect(res.body).toMatchObject({ statusCode: 409, error: 'ELECTION_NAME_CONFLICT' });
    });

    it('P9: renaming to its own current name succeeds (self excluded)', async () => {
      await patchElection(editableId, { name: editableName }, adminToken).expect(200);
    });

    it('P10: an invalid startDate is rejected with 400', async () => {
      await patchElection(editableId, { startDate: '2026-13-40' }, adminToken).expect(400);
    });

    it('P11: a partial update producing an invalid interval is rejected with 400', async () => {
      const res = await patchElection(editableId, { startTime: '19:00:00' }, adminToken).expect(
        400,
      );
      expect(res.body).toMatchObject({ statusCode: 400, error: 'ELECTION_INVALID_DATE_RANGE' });
    });

    it('P12: a client-supplied immutable field in the body is rejected with 400', async () => {
      await patchElection(editableId, { currentStatus: 'ACTIVE' }, adminToken).expect(400);
    });

    it('P13: a non-boolean blankVoteEnabled is rejected with 400', async () => {
      await patchElection(editableId, { blankVoteEnabled: 'true' }, adminToken).expect(400);
    });

    it('P14: a successful edit does not alter currentStatus or createdAt', async () => {
      const before = await prisma.election.findUnique({ where: { id: editableId } });
      await patchElection(editableId, { description: 'Again.' }, adminToken).expect(200);
      const after = await prisma.election.findUnique({ where: { id: editableId } });
      expect(after!.current_status).toBe(before!.current_status);
      expect(after!.created_at.toISOString()).toBe(before!.created_at.toISOString());
    });
  });

  describe('DELETE /elections/:id', () => {
    const deleteElection = (id: string, token: string) =>
      request(app.getHttpServer())
        .delete(`/api/v1/elections/${id}`)
        .set('Authorization', `Bearer ${token}`);

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
      await prisma.election.update({ where: { id }, data: { current_status: 'PENDING' } });

      const res = await deleteElection(id, adminToken).expect(409);
      expect(res.body).toMatchObject({ statusCode: 409, error: 'ELECTION_NOT_DELETABLE' });
      expect((await prisma.election.findUnique({ where: { id } }))!.current_status).toBe('PENDING');
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
});
