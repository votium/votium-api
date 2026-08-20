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
});
