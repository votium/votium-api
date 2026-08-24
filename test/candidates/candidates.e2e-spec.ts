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

interface LoginResponseBody {
  sessionId: string;
}

interface TokensResponseBody {
  accessToken: string;
}

interface CandidatePayload {
  firstName?: string;
  lastName?: string;
  studentCode?: string;
  programCode?: string;
  identificationNumber?: string;
  id?: string;
  createdAt?: string;
  status?: string;
}

describe('Candidates registration (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let emailService: FakeEmailService;

  let adminUser: { id: string; email: string; password: string };
  let auditorUser: { id: string; email: string; password: string };

  const suffix = Date.now();
  const usedStudentCodes: string[] = [];

  let adminToken = '';
  let auditorToken = '';

  const validCandidate = (): CandidatePayload => ({
    firstName: 'Juan',
    lastName: 'Garcia',
    studentCode: `CAND-${suffix}`,
    programCode: '1234',
    identificationNumber: `ID-${suffix}`,
  });

  const completeLogin = async (email: string, password: string): Promise<string> => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);

    const sessionId = (loginRes.body as LoginResponseBody).sessionId;
    const code = emailService.last().code;

    const verifyRes = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/verify')
      .send({ sessionId, code })
      .expect(201);

    return (verifyRes.body as TokensResponseBody).accessToken;
  };

  const register = (payload: CandidatePayload, token: string) =>
    request(app.getHttpServer())
      .post('/api/v1/candidates')
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
      email: `e2e-candidate-admin-${suffix}@example.com`,
      password: 'SuperSecret123!',
    };
    auditorUser = {
      id: '',
      email: `e2e-candidate-auditor-${suffix}@example.com`,
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
    if (usedStudentCodes.length > 0) {
      await prisma.candidate.deleteMany({ where: { student_code: { in: usedStudentCodes } } });
    }
    const ids = [adminUser.id, auditorUser.id];
    await prisma.mfaChallenge.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  describe('POST /candidates', () => {
    it('E1: an authenticated administrator registers a candidate with 201', async () => {
      const res = await register(validCandidate(), adminToken).expect(201);

      expect(res.body).toMatchObject({
        firstName: 'Juan',
        lastName: 'Garcia',
        studentCode: `CAND-${suffix}`,
        programCode: '1234',
        identificationNumber: `ID-${suffix}`,
        status: 'ACTIVE',
      });
      usedStudentCodes.push(`CAND-${suffix}`);
    });

    it('E2: the response represents the created candidate without extra fields', async () => {
      const payload = validCandidate();
      payload.studentCode = `CAND2-${suffix}`;
      payload.identificationNumber = `ID2-${suffix}`;

      const res = await register(payload, adminToken).expect(201);
      const body = res.body as Record<string, unknown>;

      expect(body.id).toBeTruthy();
      expect(body.status).toBe('ACTIVE');
      expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(Object.keys(body).sort()).toEqual(
        [
          'id',
          'firstName',
          'lastName',
          'studentCode',
          'programCode',
          'identificationNumber',
          'status',
          'createdAt',
        ].sort(),
      );
      usedStudentCodes.push(payload.studentCode);
    });

    it('E3: the candidate exists in the database with the correct values', async () => {
      const payload = validCandidate();
      payload.studentCode = `CAND3-${suffix}`;
      payload.identificationNumber = `ID3-${suffix}`;

      const res = await register(payload, adminToken).expect(201);
      const body = res.body as Record<string, unknown>;

      const row = await prisma.candidate.findUnique({
        where: { student_code: payload.studentCode },
      });

      expect(row).not.toBeNull();
      expect(row?.id).toBe(body.id);
      expect(row?.first_name).toBe('Juan');
      expect(row?.last_name).toBe('Garcia');
      expect(row?.program_code).toBe('1234');
      expect(row?.identification_number).toBe(`ID3-${suffix}`);
      expect(row?.status).toBe('ACTIVE');
      expect(row?.created_at).toBeInstanceOf(Date);
      usedStudentCodes.push(payload.studentCode);
    });

    it('E4: rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/candidates')
        .send(validCandidate())
        .expect(401);
    });

    it('E5: rejects an invalid token with 401', async () => {
      const res = await register(validCandidate(), 'not-a-real-token').expect(401);
      expect(res.body).toMatchObject({ statusCode: 401 });
    });

    it('E6: rejects a non-admin role with 403', async () => {
      const res = await register(validCandidate(), auditorToken).expect(403);
      expect(res.body).toMatchObject({ statusCode: 403 });
    });

    it('E7: rejects a missing required field with 400', async () => {
      const payload = validCandidate();
      delete payload.firstName;

      const res = await register(payload, adminToken).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E8: rejects an empty required value with 400', async () => {
      const payload = validCandidate();
      payload.firstName = '';

      const res = await register(payload, adminToken).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E9: rejects an invalid program code format with 400', async () => {
      const payload = validCandidate();
      payload.programCode = '271';

      const res = await register(payload, adminToken).expect(400);
      const body = res.body as { statusCode: number; message: string | string[] };
      expect(body.statusCode).toBe(400);
      expect(body.message).toEqual(
        expect.arrayContaining(['Program code must contain exactly four digits.']),
      );
    });

    it('E10: rejects a client-provided id with 400', async () => {
      const payload = validCandidate();
      payload.id = crypto.randomUUID();

      const res = await register(payload, adminToken).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E11: rejects a client-provided created_at with 400', async () => {
      const payload = validCandidate();
      payload.createdAt = '2026-01-01T00:00:00.000Z';

      const res = await register(payload, adminToken).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E12: rejects a client-provided status with 400', async () => {
      const payload = validCandidate();
      payload.status = 'INACTIVE';

      const res = await register(payload, adminToken).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E13: rejects a duplicate student_code with 409 and does not overwrite', async () => {
      const code = `DUPCODE-${suffix}`;
      const seeded = await prisma.candidate.create({
        data: {
          first_name: 'Seed',
          last_name: 'User',
          student_code: code,
          program_code: '1234',
          identification_number: `ID-SEED-${suffix}`,
          status: 'ACTIVE',
        },
      });
      usedStudentCodes.push(code);

      const payload = validCandidate();
      payload.studentCode = code;
      payload.identificationNumber = `ID-NEW-${suffix}`;

      const res = await register(payload, adminToken).expect(409);

      expect(res.body).toMatchObject({ statusCode: 409, error: 'CANDIDATE_CONFLICT' });

      const rows = await prisma.candidate.findMany({ where: { student_code: code } });
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(seeded.id);
      expect(rows[0].identification_number).toBe(`ID-SEED-${suffix}`);
    });

    it('E14: rejects a duplicate identification_number with 409', async () => {
      const idNumber = `IDDUP-${suffix}`;
      const code = `DUPID-${suffix}`;
      await prisma.candidate.create({
        data: {
          first_name: 'Seed',
          last_name: 'User',
          student_code: code,
          program_code: '1234',
          identification_number: idNumber,
          status: 'ACTIVE',
        },
      });
      usedStudentCodes.push(code);

      const payload = validCandidate();
      payload.studentCode = `NEWCODE-${suffix}`;
      payload.identificationNumber = idNumber;

      const res = await register(payload, adminToken).expect(409);

      expect(res.body).toMatchObject({ statusCode: 409, error: 'CANDIDATE_CONFLICT' });
      usedStudentCodes.push(payload.studentCode);
    });

    it('E15: validation errors use the standardized error body', async () => {
      const payload = validCandidate();
      delete payload.firstName;

      const res = await register(payload, adminToken).expect(400);

      const body = res.body as {
        statusCode: number;
        message: string | string[];
        timestamp: string;
        path: string;
      };
      expect(body.statusCode).toBe(400);
      expect(body.message).toBeTruthy();
      expect(typeof body.timestamp).toBe('string');
      expect(typeof body.path).toBe('string');
    });

    it('E16: failed requests do not create unrelated records', async () => {
      const before = await prisma.candidate.count();

      const invalid = validCandidate();
      invalid.firstName = '';
      await register(invalid, adminToken).expect(400);

      await request(app.getHttpServer())
        .post('/api/v1/candidates')
        .send(validCandidate())
        .expect(401);

      const forbidden = validCandidate();
      forbidden.studentCode = `FORB-${suffix}`;
      await register(forbidden, auditorToken).expect(403);

      const after = await prisma.candidate.count();
      expect(after).toBe(before);
    });

    it('E17: rejects whitespace-only required values with 400', async () => {
      const payload = validCandidate();
      payload.firstName = '   ';

      const res = await register(payload, adminToken).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });
  });

  describe('GET /candidates (query)', () => {
    const queryCandidates = (qs: string, token: string = adminToken) =>
      request(app.getHttpServer())
        .get(`/api/v1/candidates${qs}`)
        .set('Authorization', `Bearer ${token}`);

    // Names/codes intentionally unique so they cannot collide with candidates created by the
    // POST tests (which persist until the top-level afterAll cleanup).
    const querySeed = [
      {
        firstName: 'Bruno',
        lastName: 'Fernandez',
        programCode: '5001',
        studentCode: `Q1-${suffix}`,
        identificationNumber: `QI1-${suffix}`,
      },
      {
        firstName: 'Clara',
        lastName: 'Molina',
        programCode: '5002',
        studentCode: `Q2-${suffix}`,
        identificationNumber: `QI2-${suffix}`,
      },
      {
        firstName: 'Bruno',
        lastName: 'Rojas',
        programCode: '5001',
        studentCode: `Q3-${suffix}`,
        identificationNumber: `QI3-${suffix}`,
      },
      {
        firstName: 'Diana',
        lastName: 'Torres',
        programCode: '5003',
        studentCode: `Q4-${suffix}`,
        identificationNumber: `QI4-${suffix}`,
      },
    ];

    beforeAll(async () => {
      for (const seed of querySeed) {
        await prisma.candidate.create({
          data: {
            first_name: seed.firstName,
            last_name: seed.lastName,
            student_code: seed.studentCode,
            program_code: seed.programCode,
            identification_number: seed.identificationNumber,
            status: 'ACTIVE',
          },
        });
        usedStudentCodes.push(seed.studentCode);
      }
    });

    it('E1: returns all registered candidates without filters', async () => {
      const res = await queryCandidates('').expect(200);
      const body = res.body as { data: Array<Record<string, unknown>> };
      const data = body.data;

      const codes = data.map((item) => item.studentCode);
      expect(codes).toEqual(expect.arrayContaining(querySeed.map((s) => s.studentCode)));

      const times = data.map((item) => new Date(item.createdAt as string).getTime());
      for (let i = 1; i < times.length; i++) {
        expect(times[i]).toBeLessThanOrEqual(times[i - 1]);
      }
    });

    it('E2: filters by firstName with a partial, case-insensitive match', async () => {
      const res = await queryCandidates('?firstName=bruno').expect(200);
      const body = res.body as { data: Array<{ studentCode: string }> };
      const codes = body.data.map((c) => c.studentCode);
      expect(codes.sort()).toEqual([`Q1-${suffix}`, `Q3-${suffix}`].sort());
    });

    it('E3: filters by lastName with a partial, case-insensitive match', async () => {
      const res = await queryCandidates('?lastName=torres').expect(200);
      const body = res.body as { data: Array<{ studentCode: string }> };
      const codes = body.data.map((c) => c.studentCode);
      expect(codes).toEqual([`Q4-${suffix}`]);
    });

    it('E4: filters by studyPlanCode', async () => {
      const res = await queryCandidates('?studyPlanCode=5001').expect(200);
      const body = res.body as { data: Array<{ studentCode: string }> };
      const codes = body.data.map((c) => c.studentCode);
      expect(codes.sort()).toEqual([`Q1-${suffix}`, `Q3-${suffix}`].sort());
    });

    it('E5: filters by studentCode', async () => {
      const res = await queryCandidates(`?studentCode=${`Q2-${suffix}`}`).expect(200);
      const body = res.body as { data: Array<{ studentCode: string }> };
      const codes = body.data.map((c) => c.studentCode);
      expect(codes).toEqual([`Q2-${suffix}`]);
    });

    it('E6: filters by identificationNumber', async () => {
      const res = await queryCandidates(`?identificationNumber=${`QI4-${suffix}`}`).expect(200);
      const body = res.body as { data: Array<{ studentCode: string }> };
      const codes = body.data.map((c) => c.studentCode);
      expect(codes).toEqual([`Q4-${suffix}`]);
    });

    it('E7: combines multiple filters with AND semantics', async () => {
      const res = await queryCandidates(
        `?firstName=Bruno&studyPlanCode=5001&studentCode=${`Q1-${suffix}`}`,
      ).expect(200);
      const body = res.body as { data: Array<{ studentCode: string }> };
      const codes = body.data.map((c) => c.studentCode);
      expect(codes).toEqual([`Q1-${suffix}`]);
    });

    it('E8: returns an empty collection when nothing matches (not an error)', async () => {
      const res = await queryCandidates('?studentCode=does-not-exist').expect(200);
      expect(res.body).toEqual({ data: [] });
    });

    it('E9: ignores empty and whitespace-only filter values', async () => {
      const noFilter = await queryCandidates('').expect(200);
      const noFilterBody = noFilter.body as { data: Array<{ studentCode: string }> };
      const noFilterCodes = noFilterBody.data.map((c) => c.studentCode).sort();

      const res = await queryCandidates('?firstName=%20%20&lastName=').expect(200);
      const body = res.body as { data: Array<{ studentCode: string }> };
      const filteredCodes = body.data.map((c) => c.studentCode).sort();

      expect(filteredCodes).toEqual(noFilterCodes);
    });

    it('E10: rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/candidates').expect(401);
    });

    it('E11: rejects an invalid token with 401', async () => {
      const res = await queryCandidates('', 'not-a-real-token').expect(401);
      expect(res.body).toMatchObject({ statusCode: 401 });
    });

    it('E12: allows the auditor role', async () => {
      const res = await queryCandidates('', auditorToken).expect(200);
      const body = res.body as { data: Array<{ studentCode: string }> };
      const codes = body.data.map((c) => c.studentCode);
      expect(codes).toEqual(expect.arrayContaining(querySeed.map((s) => s.studentCode)));
    });

    it('E13: rejects an invalid studyPlanCode format with 400', async () => {
      const res = await queryCandidates('?studyPlanCode=271').expect(400);

      const body = res.body as {
        statusCode: number;
        message: string | string[];
        timestamp: string;
        path: string;
      };
      expect(body.statusCode).toBe(400);
      expect(body.message).toEqual(
        expect.arrayContaining(['Program code must contain exactly four digits.']),
      );
      expect(typeof body.timestamp).toBe('string');
      expect(typeof body.path).toBe('string');
    });

    it('E14: rejects unknown query parameters with 400', async () => {
      await queryCandidates('?unknown=value').expect(400);
    });

    it('E15: response items expose exactly the CandidateResponseDto contract', async () => {
      const res = await queryCandidates('').expect(200);
      const body = res.body as { data: Array<Record<string, unknown>> };
      const item = body.data[0];

      expect(Object.keys(item).sort()).toEqual(
        [
          'id',
          'firstName',
          'lastName',
          'studentCode',
          'programCode',
          'identificationNumber',
          'status',
          'createdAt',
        ].sort(),
      );
    });

    it('E16: the query endpoint is read-only', async () => {
      const before = await prisma.candidate.count();

      await queryCandidates('').expect(200);
      await queryCandidates('?firstName=bruno').expect(200);
      await queryCandidates('?studentCode=does-not-exist').expect(200);

      const after = await prisma.candidate.count();
      expect(after).toBe(before);
    });
  });

  describe('DELETE /candidates/:id', () => {
    const deleteCandidate = (id: string, token: string = adminToken) =>
      request(app.getHttpServer())
        .delete(`/api/v1/candidates/${id}`)
        .set('Authorization', `Bearer ${token}`);

    const registerCandidate = async (): Promise<{ id: string; studentCode: string }> => {
      const payload = validCandidate();
      payload.studentCode = `DEL-${suffix}-${usedStudentCodes.length}`;
      payload.identificationNumber = `IDDEL-${suffix}-${usedStudentCodes.length}`;
      const res = await register(payload, adminToken).expect(201);
      usedStudentCodes.push(payload.studentCode);
      return { id: (res.body as { id: string }).id, studentCode: payload.studentCode };
    };

    it('E1: an authenticated administrator logically deletes a candidate with 204 and no body', async () => {
      const { id } = await registerCandidate();

      const del = await deleteCandidate(id).expect(204);

      expect(del.body).toEqual({});
    });

    it('E2: does not physically delete the record and marks it INACTIVE', async () => {
      const { id } = await registerCandidate();
      const before = await prisma.candidate.findUnique({ where: { id } });
      const countBefore = await prisma.candidate.count();

      await deleteCandidate(id).expect(204);

      const after = await prisma.candidate.findUnique({ where: { id } });
      const countAfter = await prisma.candidate.count();

      expect(after).not.toBeNull();
      expect(after?.status).toBe('INACTIVE');
      expect(after?.first_name).toBe(before?.first_name);
      expect(after?.last_name).toBe(before?.last_name);
      expect(after?.student_code).toBe(before?.student_code);
      expect(after?.program_code).toBe(before?.program_code);
      expect(after?.identification_number).toBe(before?.identification_number);
      expect(countAfter).toBe(countBefore);
    });

    it('E3: a deleted candidate is excluded from candidate query results', async () => {
      const { id, studentCode } = await registerCandidate();

      await deleteCandidate(id).expect(204);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/candidates?studentCode=${studentCode}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = res.body as { data: Array<{ studentCode: string }> };
      expect(body.data).toEqual([]);
    });

    it('E4: a repeated delete is idempotent and returns 204 again', async () => {
      const { id } = await registerCandidate();

      await deleteCandidate(id).expect(204);
      await deleteCandidate(id).expect(204);
    });

    it('E5: rejects unauthenticated requests with 401', async () => {
      const { id } = await registerCandidate();

      await request(app.getHttpServer()).delete(`/api/v1/candidates/${id}`).expect(401);
    });

    it('E6: rejects an invalid token with 401', async () => {
      const { id } = await registerCandidate();

      const res = await deleteCandidate(id, 'not-a-real-token').expect(401);

      expect(res.body).toMatchObject({ statusCode: 401 });
    });

    it('E7: rejects a non-admin role with 403', async () => {
      const { id } = await registerCandidate();

      const res = await deleteCandidate(id, auditorToken).expect(403);

      expect(res.body).toMatchObject({ statusCode: 403 });
    });

    it('E8: returns 404 with CANDIDATE_NOT_FOUND for an unknown id', async () => {
      const res = await deleteCandidate(crypto.randomUUID()).expect(404);

      expect(res.body).toMatchObject({ statusCode: 404, error: 'CANDIDATE_NOT_FOUND' });
    });

    it('E9: rejects a malformed id with 400', async () => {
      const res = await deleteCandidate('not-a-uuid').expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E10: does not modify unrelated candidate fields', async () => {
      const { id } = await registerCandidate();
      const before = await prisma.candidate.findUnique({ where: { id } });

      await deleteCandidate(id).expect(204);

      const after = await prisma.candidate.findUnique({ where: { id } });
      expect(after?.status).toBe('INACTIVE');
      expect(after?.first_name).toBe(before?.first_name);
      expect(after?.last_name).toBe(before?.last_name);
      expect(after?.student_code).toBe(before?.student_code);
      expect(after?.program_code).toBe(before?.program_code);
      expect(after?.identification_number).toBe(before?.identification_number);
      expect(after?.created_at?.getTime()).toBe(before?.created_at?.getTime());
    });
  });

  describe('PATCH /candidates/:id', () => {
    // VOTER role is not defined in the current RoleName value object, so only
    // AUDITOR is exercised for the forbidden scenarios (spec business rule 1).
    const updateCandidate = (id: string, payload: CandidatePayload, token: string = adminToken) =>
      request(app.getHttpServer())
        .patch(`/api/v1/candidates/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send(payload);

    const registerAndGetId = async (payload: CandidatePayload): Promise<string> => {
      const res = await register(payload, adminToken).expect(201);
      return (res.body as { id: string }).id;
    };

    const patchSeed = (studentCode: string, identificationNumber: string): CandidatePayload => ({
      firstName: 'Patch',
      lastName: 'Cand',
      studentCode,
      programCode: '1234',
      identificationNumber,
    });

    it('E1: an authenticated administrator updates a candidate with 200', async () => {
      const id = await registerAndGetId(patchSeed(`PATCH1-${suffix}`, `IDPATCH1-${suffix}`));
      usedStudentCodes.push(`PATCH1-${suffix}`);

      const res = await updateCandidate(id, {
        firstName: 'Updated',
        lastName: 'Name',
        programCode: '2710',
        identificationNumber: 'IDPATCH1-NEW',
      }).expect(200);

      expect(res.body).toMatchObject({
        id,
        firstName: 'Updated',
        lastName: 'Name',
        programCode: '2710',
        identificationNumber: 'IDPATCH1-NEW',
        status: 'ACTIVE',
      });
    });

    it('E2: partial update preserves omitted fields and immutable values', async () => {
      const id = await registerAndGetId(patchSeed(`PATCH2-${suffix}`, `IDPATCH2-${suffix}`));
      usedStudentCodes.push(`PATCH2-${suffix}`);

      const before = await prisma.candidate.findUnique({ where: { id } });

      const res = await updateCandidate(id, { firstName: 'OnlyFirst' }).expect(200);
      const body = res.body as Record<string, unknown>;

      expect(body.firstName).toBe('OnlyFirst');
      expect(body.lastName).toBe('Cand');
      expect(body.programCode).toBe('1234');
      expect(body.identificationNumber).toBe(`IDPATCH2-${suffix}`);
      expect(body.studentCode).toBe(`PATCH2-${suffix}`);
      expect(body.status).toBe('ACTIVE');
      expect(body.createdAt).toBe(before?.created_at?.toISOString());
    });

    it('E3: partial update of only identificationNumber', async () => {
      const id = await registerAndGetId(patchSeed(`PATCH3-${suffix}`, `IDPATCH3-${suffix}`));
      usedStudentCodes.push(`PATCH3-${suffix}`);

      const res = await updateCandidate(id, { identificationNumber: 'IDPATCH3-NEW' }).expect(200);
      const body = res.body as Record<string, unknown>;

      expect(body.identificationNumber).toBe('IDPATCH3-NEW');
      expect(body.firstName).toBe('Patch');
      expect(body.lastName).toBe('Cand');
    });

    it('E4: rejects unauthenticated requests with 401', async () => {
      const id = await registerAndGetId(patchSeed(`PATCH4-${suffix}`, `IDPATCH4-${suffix}`));
      usedStudentCodes.push(`PATCH4-${suffix}`);

      await request(app.getHttpServer())
        .patch(`/api/v1/candidates/${id}`)
        .send({ firstName: 'X' })
        .expect(401);
    });

    it('E5: rejects an invalid token with 401', async () => {
      const id = await registerAndGetId(patchSeed(`PATCH5-${suffix}`, `IDPATCH5-${suffix}`));
      usedStudentCodes.push(`PATCH5-${suffix}`);

      const res = await updateCandidate(id, { firstName: 'X' }, 'not-a-real-token').expect(401);
      expect(res.body).toMatchObject({ statusCode: 401 });
    });

    it('E6: rejects a non-admin role (AUDITOR) with 403', async () => {
      const id = await registerAndGetId(patchSeed(`PATCH6-${suffix}`, `IDPATCH6-${suffix}`));
      usedStudentCodes.push(`PATCH6-${suffix}`);

      const res = await updateCandidate(id, { firstName: 'X' }, auditorToken).expect(403);
      expect(res.body).toMatchObject({ statusCode: 403 });
    });

    it('E8: returns 404 with CANDIDATE_NOT_FOUND for an unknown id', async () => {
      const res = await updateCandidate(crypto.randomUUID(), { firstName: 'Updated' }).expect(404);

      expect(res.body).toMatchObject({ statusCode: 404, error: 'CANDIDATE_NOT_FOUND' });
    });

    it('E9: treats a logically deleted candidate as not found (404)', async () => {
      const id = await registerAndGetId(patchSeed(`PATCH9-${suffix}`, `IDPATCH9-${suffix}`));
      usedStudentCodes.push(`PATCH9-${suffix}`);

      await request(app.getHttpServer())
        .delete(`/api/v1/candidates/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      const res = await updateCandidate(id, { firstName: 'Updated' }).expect(404);
      expect(res.body).toMatchObject({ statusCode: 404, error: 'CANDIDATE_NOT_FOUND' });
    });

    it('E10: rejects a malformed id with 400', async () => {
      const res = await updateCandidate('not-a-uuid', { firstName: 'X' }).expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E11: rejects a firstName shorter than 2 characters with 400', async () => {
      const id = await registerAndGetId(patchSeed(`PATCH11-${suffix}`, `IDPATCH11-${suffix}`));
      usedStudentCodes.push(`PATCH11-${suffix}`);

      const res = await updateCandidate(id, { firstName: 'X' }).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E12: rejects a firstName longer than 100 characters with 400', async () => {
      const id = await registerAndGetId(patchSeed(`PATCH12-${suffix}`, `IDPATCH12-${suffix}`));
      usedStudentCodes.push(`PATCH12-${suffix}`);

      const res = await updateCandidate(id, { firstName: 'a'.repeat(101) }).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E13: rejects a lastName shorter than 2 characters with 400', async () => {
      const id = await registerAndGetId(patchSeed(`PATCH13-${suffix}`, `IDPATCH13-${suffix}`));
      usedStudentCodes.push(`PATCH13-${suffix}`);

      const res = await updateCandidate(id, { lastName: 'Y' }).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E14: rejects an invalid program code format with 400', async () => {
      const id = await registerAndGetId(patchSeed(`PATCH14-${suffix}`, `IDPATCH14-${suffix}`));
      usedStudentCodes.push(`PATCH14-${suffix}`);

      const res = await updateCandidate(id, { programCode: '271' }).expect(400);
      const body = res.body as { statusCode: number; message: string | string[] };
      expect(body.statusCode).toBe(400);
      expect(body.message).toEqual(
        expect.arrayContaining(['Program code must contain exactly four digits.']),
      );
    });

    it('E15: rejects an empty identificationNumber with 400', async () => {
      const id = await registerAndGetId(patchSeed(`PATCH15-${suffix}`, `IDPATCH15-${suffix}`));
      usedStudentCodes.push(`PATCH15-${suffix}`);

      const res = await updateCandidate(id, { identificationNumber: '' }).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E16: rejects unknown/system-managed fields in the body with 400', async () => {
      const id = await registerAndGetId(patchSeed(`PATCH16-${suffix}`, `IDPATCH16-${suffix}`));
      usedStudentCodes.push(`PATCH16-${suffix}`);

      const res = await updateCandidate(id, {
        firstName: 'Ok',
        id: crypto.randomUUID(),
        studentCode: 'HACK',
        status: 'INACTIVE',
        createdAt: '2026-01-01T00:00:00.000Z',
      }).expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });

      const row = await prisma.candidate.findUnique({ where: { id } });
      expect(row?.first_name).toBe('Patch');
      expect(row?.student_code).toBe(`PATCH16-${suffix}`);
      expect(row?.status).toBe('ACTIVE');
    });

    it('E17: rejects a duplicate identificationNumber with 409 and does not change the row', async () => {
      const idA = await registerAndGetId(patchSeed(`PATCH17A-${suffix}`, `IDPATCH17A-${suffix}`));
      await registerAndGetId(patchSeed(`PATCH17B-${suffix}`, `IDPATCH17B-${suffix}`));
      usedStudentCodes.push(`PATCH17A-${suffix}`, `PATCH17B-${suffix}`);

      const res = await updateCandidate(idA, {
        identificationNumber: `IDPATCH17B-${suffix}`,
      }).expect(409);

      expect(res.body).toMatchObject({ statusCode: 409, error: 'CANDIDATE_CONFLICT' });

      const rowA = await prisma.candidate.findUnique({ where: { id: idA } });
      expect(rowA?.identification_number).toBe(`IDPATCH17A-${suffix}`);
    });

    it('E18: the response exposes exactly the CandidateResponseDto contract', async () => {
      const id = await registerAndGetId(patchSeed(`PATCH18-${suffix}`, `IDPATCH18-${suffix}`));
      usedStudentCodes.push(`PATCH18-${suffix}`);

      const res = await updateCandidate(id, { firstName: 'Contract' }).expect(200);
      const body = res.body as Record<string, unknown>;

      expect(Object.keys(body).sort()).toEqual(
        [
          'id',
          'firstName',
          'lastName',
          'studentCode',
          'programCode',
          'identificationNumber',
          'status',
          'createdAt',
        ].sort(),
      );
    });

    it('E19: createdAt is serialized as an ISO string', async () => {
      const id = await registerAndGetId(patchSeed(`PATCH19-${suffix}`, `IDPATCH19-${suffix}`));
      usedStudentCodes.push(`PATCH19-${suffix}`);

      const res = await updateCandidate(id, { firstName: 'Iso' }).expect(200);
      const body = res.body as Record<string, unknown>;
      expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('E20: repeated identical updates are idempotent', async () => {
      const id = await registerAndGetId(patchSeed(`PATCH20-${suffix}`, `IDPATCH20-${suffix}`));
      usedStudentCodes.push(`PATCH20-${suffix}`);

      const first = await updateCandidate(id, { firstName: 'Same' }).expect(200);
      const second = await updateCandidate(id, { firstName: 'Same' }).expect(200);
      const firstBody = first.body as Record<string, unknown>;
      const secondBody = second.body as Record<string, unknown>;

      expect(secondBody.firstName).toBe('Same');
      expect(secondBody.firstName).toBe(firstBody.firstName);
    });

    it('E21: failed requests do not create or modify records', async () => {
      const before = await prisma.candidate.count();

      const id = await registerAndGetId(patchSeed(`PATCH21-${suffix}`, `IDPATCH21-${suffix}`));
      usedStudentCodes.push(`PATCH21-${suffix}`);

      const beforeRow = await prisma.candidate.findUnique({ where: { id } });

      await updateCandidate(id, { firstName: 'X' }).expect(400); // too short
      await updateCandidate(id, { firstName: 'Valid' }, 'not-a-real-token').expect(401);
      await updateCandidate(id, { firstName: 'Valid' }, auditorToken).expect(403);

      const after = await prisma.candidate.count();
      expect(after).toBe(before + 1);

      const afterRow = await prisma.candidate.findUnique({ where: { id } });
      expect(afterRow?.first_name).toBe(beforeRow?.first_name);
    });
  });
});
