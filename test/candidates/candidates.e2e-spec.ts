import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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
  companionFirstName?: string | null;
  companionLastName?: string | null;
  companionStudentCode?: string | null;
  companionProgramCode?: string | null;
  companionIdentification?: string | null;
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
          'companionFirstName',
          'companionLastName',
          'companionStudentCode',
          'companionProgramCode',
          'companionIdentification',
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
      const before = await prisma.candidate.count({
        where: { student_code: { in: usedStudentCodes } },
      });

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

      const after = await prisma.candidate.count({
        where: { student_code: { in: usedStudentCodes } },
      });
      expect(after).toBe(before);
    });

    it('E17: rejects whitespace-only required values with 400', async () => {
      const payload = validCandidate();
      payload.firstName = '   ';

      const res = await register(payload, adminToken).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E18: registers a candidate with a full companion set (trimmed and persisted)', async () => {
      const payload = validCandidate();
      payload.studentCode = `CANDCOM-${suffix}`;
      payload.identificationNumber = `IDCOM-${suffix}`;
      payload.companionFirstName = '  Maria  ';
      payload.companionLastName = '  Lopez ';
      payload.companionStudentCode = ' 20209999 ';
      payload.companionProgramCode = ' 9999 ';
      payload.companionIdentification = ' 2000000000 ';
      usedStudentCodes.push(payload.studentCode);

      const res = await register(payload, adminToken).expect(201);

      expect(res.body).toMatchObject({
        companionFirstName: 'Maria',
        companionLastName: 'Lopez',
        companionStudentCode: '20209999',
        companionProgramCode: '9999',
        companionIdentification: '2000000000',
      });

      const row = await prisma.candidate.findUnique({
        where: { student_code: payload.studentCode },
      });
      expect(row).not.toBeNull();
      expect(row?.companion_first_name).toBe('Maria');
      expect(row?.companion_last_name).toBe('Lopez');
      expect(row?.companion_student_code).toBe('20209999');
      expect(row?.companion_program_code).toBe('9999');
      expect(row?.companion_identification).toBe('2000000000');
    });

    it('E19: rejects a partial companion set with 400 CANDIDATE_COMPANION_INCOMPLETE', async () => {
      const payload = validCandidate();
      payload.studentCode = `CANDPART-${suffix}`;
      payload.identificationNumber = `IDPART-${suffix}`;
      payload.companionFirstName = 'Maria';
      payload.companionLastName = 'Lopez';
      payload.companionStudentCode = '20209999';
      payload.companionProgramCode = '9999';
      usedStudentCodes.push(payload.studentCode);

      const res = await register(payload, adminToken).expect(400);

      const body = res.body as { statusCode: number; error: string; message: string };
      expect(body.statusCode).toBe(400);
      expect(body.error).toBe('CANDIDATE_COMPANION_INCOMPLETE');
      expect(body.message).toBeTruthy();

      const rows = await prisma.candidate.findMany({
        where: { student_code: payload.studentCode },
      });
      expect(rows).toHaveLength(0);
    });

    it('E20: rejects an invalid companion program code with 400', async () => {
      const payload = validCandidate();
      payload.studentCode = `CANDCPC-${suffix}`;
      payload.identificationNumber = `IDCPC-${suffix}`;
      payload.companionFirstName = 'Maria';
      payload.companionLastName = 'Lopez';
      payload.companionStudentCode = '20209999';
      payload.companionProgramCode = '12';
      payload.companionIdentification = '2000000000';
      usedStudentCodes.push(payload.studentCode);

      const res = await register(payload, adminToken).expect(400);
      const body = res.body as { statusCode: number; message: string | string[] };
      expect(body.statusCode).toBe(400);
      expect(body.message).toEqual(
        expect.arrayContaining(['Companion program code must contain exactly four digits.']),
      );
    });

    it('E21: explicit null companion values are treated as absent (201, all null)', async () => {
      const payload = validCandidate();
      payload.studentCode = `CANDNULL-${suffix}`;
      payload.identificationNumber = `IDNULL-${suffix}`;
      payload.companionFirstName = null;
      payload.companionLastName = null;
      payload.companionStudentCode = null;
      payload.companionProgramCode = null;
      payload.companionIdentification = null;
      usedStudentCodes.push(payload.studentCode);

      const res = await register(payload, adminToken).expect(201);
      const body = res.body as CandidatePayload;

      expect(body.companionFirstName).toBeNull();
      expect(body.companionLastName).toBeNull();
      expect(body.companionStudentCode).toBeNull();
      expect(body.companionProgramCode).toBeNull();
      expect(body.companionIdentification).toBeNull();

      const row = await prisma.candidate.findUnique({
        where: { student_code: payload.studentCode },
      });
      expect(row?.companion_first_name).toBeNull();
      expect(row?.companion_identification).toBeNull();
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

    const pgCodes: string[] = [];
    let inactiveStudentCode = '';
    const q10pCodes: string[] = [];

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

      // Pagination seeds with explicit staggered created_at for deterministic order.
      const now = Date.now();
      for (let i = 0; i < 3; i++) {
        const row = await prisma.candidate.create({
          data: {
            first_name: `PG-${suffix}-${i}`,
            last_name: `RowP${i}`,
            student_code: `PG-${suffix}-${i}`,
            program_code: '7777',
            identification_number: `IDPG-${suffix}-${i}`,
            status: 'ACTIVE',
            created_at: new Date(now - (3 - i) * 60_000),
          },
        });
        pgCodes.push(row.student_code);
        usedStudentCodes.push(row.student_code);
      }

      // INACTIVE seed used by the status cases.
      const inactive = await prisma.candidate.create({
        data: {
          first_name: 'InactiveSeed',
          last_name: 'Row',
          student_code: `INAC-${suffix}`,
          program_code: '1234',
          identification_number: `IDINAC-${suffix}`,
          status: 'INACTIVE',
        },
      });
      inactiveStudentCode = inactive.student_code;
      usedStudentCodes.push(inactive.student_code);

      // 2 ACTIVE + 1 INACTIVE rows sharing a common prefix (status + pagination).
      for (const tag of ['1', '2', '3']) {
        const row = await prisma.candidate.create({
          data: {
            first_name: `Q10P-${suffix}-${tag}`,
            last_name: `Combo${tag}`,
            student_code: `Q10P-${suffix}-${tag}`,
            program_code: '8000',
            identification_number: `IDQ10P-${suffix}-${tag}`,
            status: tag === '3' ? 'INACTIVE' : 'ACTIVE',
          },
        });
        q10pCodes.push(row.student_code);
        usedStudentCodes.push(row.student_code);
      }
    });

    it('E1: returns all registered candidates without filters (paged envelope)', async () => {
      const res = await queryCandidates('?limit=100').expect(200);
      const body = res.body as {
        data: Array<Record<string, unknown>>;
        meta: { page: number; limit: number; total: number; totalPages: number };
      };
      const data = body.data;

      expect(Array.isArray(data)).toBe(true);
      expect(Object.keys(body.meta).sort()).toEqual(
        ['limit', 'page', 'total', 'totalPages'].sort(),
      );
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(100);

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

    it('E4: filters by programCode', async () => {
      const res = await queryCandidates('?programCode=5001').expect(200);
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
        `?firstName=Bruno&programCode=5001&studentCode=${`Q1-${suffix}`}`,
      ).expect(200);
      const body = res.body as { data: Array<{ studentCode: string }> };
      const codes = body.data.map((c) => c.studentCode);
      expect(codes).toEqual([`Q1-${suffix}`]);
    });

    it('E8: returns an empty collection when nothing matches (not an error)', async () => {
      const res = await queryCandidates('?studentCode=does-not-exist').expect(200);
      expect(res.body).toMatchObject({ data: [], meta: { total: 0 } });
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
      const res = await queryCandidates('?limit=100', auditorToken).expect(200);
      const body = res.body as { data: Array<{ studentCode: string }> };
      const codes = body.data.map((c) => c.studentCode);
      expect(codes).toEqual(expect.arrayContaining(querySeed.map((s) => s.studentCode)));
    });

    it('E13: rejects an invalid programCode format with 400', async () => {
      const res = await queryCandidates('?programCode=271').expect(400);

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

    it('E13b: rejects the removed studyPlanCode parameter with 400', async () => {
      const res = await queryCandidates('?studyPlanCode=5001').expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
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
          'companionFirstName',
          'companionLastName',
          'companionStudentCode',
          'companionProgramCode',
          'companionIdentification',
          'createdAt',
        ].sort(),
      );
    });

    it('E16: the query endpoint is read-only', async () => {
      const before = await prisma.candidate.count({
        where: { student_code: { in: usedStudentCodes } },
      });

      await queryCandidates('?limit=10&page=1').expect(200);
      await queryCandidates('?firstName=bruno').expect(200);
      await queryCandidates('?studentCode=does-not-exist').expect(200);

      const after = await prisma.candidate.count({
        where: { student_code: { in: usedStudentCodes } },
      });
      expect(after).toBe(before);
    });

    it('Q1: the default response exposes the paginated envelope', async () => {
      const res = await queryCandidates('').expect(200);
      const body = res.body as {
        data: unknown[];
        meta: { page: number; limit: number; total: number; totalPages: number };
      };

      expect(Array.isArray(body.data)).toBe(true);
      expect(Object.keys(body.meta).sort()).toEqual(
        ['limit', 'page', 'total', 'totalPages'].sort(),
      );
      expect(body.meta.page).toBe(1);
      expect(body.meta.limit).toBe(10);
      expect(body.meta.total).toBeGreaterThanOrEqual(querySeed.length);
    });

    it('Q2: paginates end-to-end with the name filter', async () => {
      type PagedBody = {
        data: Array<{ studentCode: string }>;
        meta: { page: number; limit: number; total: number; totalPages: number };
      };

      const page1 = await queryCandidates(`?name=PG-${suffix}&limit=1&page=1`).expect(200);
      const body1 = page1.body as PagedBody;
      expect(body1.data).toHaveLength(1);
      expect(body1.meta).toEqual({ page: 1, limit: 1, total: 3, totalPages: 3 });

      const page2 = await queryCandidates(`?name=PG-${suffix}&limit=1&page=2`).expect(200);
      const body2 = page2.body as PagedBody;
      expect(body2.data).toHaveLength(1);
      expect(body2.meta).toEqual({ page: 2, limit: 1, total: 3, totalPages: 3 });

      const page3 = await queryCandidates(`?name=PG-${suffix}&limit=1&page=3`).expect(200);
      const body3 = page3.body as PagedBody;
      expect(body3.data).toHaveLength(1);
      expect(body3.meta).toEqual({ page: 3, limit: 1, total: 3, totalPages: 3 });

      const codes = [
        body1.data[0].studentCode,
        body2.data[0].studentCode,
        body3.data[0].studentCode,
      ];
      expect(codes).toHaveLength(3);
      expect(new Set(codes).size).toBe(3);
      expect(new Set(codes)).toEqual(new Set(pgCodes));
    });

    it('Q3: an out-of-range page returns an empty slice but keeps the real total', async () => {
      const res = await queryCandidates(`?name=PG-${suffix}&page=99&limit=1`).expect(200);
      const body = res.body as {
        data: unknown[];
        meta: { page: number; limit: number; total: number; totalPages: number };
      };
      expect(body.data).toEqual([]);
      expect(body.meta).toEqual({ page: 99, limit: 1, total: 3, totalPages: 3 });
    });

    it('Q4: a limit larger than the total returns everything in one page', async () => {
      const res = await queryCandidates(`?name=PG-${suffix}&limit=100`).expect(200);
      const body = res.body as {
        data: unknown[];
        meta: { page: number; limit: number; total: number; totalPages: number };
      };
      expect(body.data).toHaveLength(3);
      expect(body.data.length).toBe(body.meta.total);
      expect(body.meta).toEqual({ page: 1, limit: 100, total: 3, totalPages: 1 });
    });

    it('Q5: rejects invalid page and limit values with 400', async () => {
      await queryCandidates('?page=0').expect(400);
      await queryCandidates('?page=-1').expect(400);
      await queryCandidates('?page=1.5').expect(400);
      await queryCandidates('?limit=0').expect(400);
      await queryCandidates('?limit=abc').expect(400);
    });

    it('Q6: includes INACTIVE candidates by default', async () => {
      const res = await queryCandidates(`?studentCode=${inactiveStudentCode}`).expect(200);
      const body = res.body as { data: Array<{ status: string }>; meta: { total: number } };
      expect(body.data).toHaveLength(1);
      expect(body.data[0].status).toBe('INACTIVE');
      expect(body.meta.total).toBe(1);
    });

    it('Q7: status=INACTIVE returns only INACTIVE candidates and counts them in total', async () => {
      const res = await queryCandidates(
        `?studentCode=${inactiveStudentCode}&status=INACTIVE`,
      ).expect(200);
      const body = res.body as {
        data: Array<{ status: string }>;
        meta: { total: number };
      };
      expect(body.data).toHaveLength(1);
      expect(body.data[0].status).toBe('INACTIVE');
      expect(body.meta.total).toBe(1);
    });

    it('Q8: status=ACTIVE excludes the INACTIVE candidate', async () => {
      const res = await queryCandidates(`?studentCode=${inactiveStudentCode}&status=ACTIVE`).expect(
        200,
      );
      const body = res.body as { data: unknown[]; meta: { total: number } };
      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });

    it('Q9: rejects status values outside the domain with 400', async () => {
      await queryCandidates(`?studentCode=${inactiveStudentCode}&status=DELETED`).expect(400);
      await queryCandidates(`?studentCode=${inactiveStudentCode}&status=foo`).expect(400);
      await queryCandidates(`?studentCode=${inactiveStudentCode}&status=`).expect(400);
    });

    it('Q10: status combined with pagination keeps total consistent', async () => {
      const all = await queryCandidates(`?name=Q10P-${suffix}&limit=10`).expect(200);
      const allBody = all.body as { data: unknown[]; meta: { total: number } };
      expect(allBody.data).toHaveLength(3);
      expect(allBody.meta.total).toBe(3);

      const activePage1 = await queryCandidates(
        `?name=Q10P-${suffix}&status=ACTIVE&limit=1&page=1`,
      ).expect(200);
      const activeBody1 = activePage1.body as { data: unknown[]; meta: { total: number } };
      expect(activeBody1.data).toHaveLength(1);
      expect(activeBody1.meta.total).toBe(2);

      const activePage2 = await queryCandidates(
        `?name=Q10P-${suffix}&status=ACTIVE&limit=1&page=2`,
      ).expect(200);
      const activeBody2 = activePage2.body as { data: unknown[]; meta: { total: number } };
      expect(activeBody2.data).toHaveLength(1);
      expect(activeBody2.meta.total).toBe(2);

      const inactive = await queryCandidates(`?name=Q10P-${suffix}&status=INACTIVE&limit=2`).expect(
        200,
      );
      const inactiveBody = inactive.body as { data: unknown[]; meta: { total: number } };
      expect(inactiveBody.data).toHaveLength(1);
      expect(inactiveBody.meta.total).toBe(1);
    });

    it('Q11: the name filter matches a partial first name', async () => {
      const res = await queryCandidates('?name=bruno').expect(200);
      const body = res.body as { data: Array<{ studentCode: string }> };
      const codes = body.data.map((c) => c.studentCode).sort();
      expect(codes).toEqual([`Q1-${suffix}`, `Q3-${suffix}`].sort());
    });

    it('Q12: the name filter matches a partial last name', async () => {
      const res = await queryCandidates('?name=molina').expect(200);
      const body = res.body as { data: Array<{ studentCode: string }> };
      const codes = body.data.map((c) => c.studentCode);
      expect(codes).toEqual([`Q2-${suffix}`]);
    });

    it('Q13: the name filter is partial and case-insensitive', async () => {
      const byShort = await queryCandidates('?name=br').expect(200);
      const shortBody = byShort.body as { data: Array<{ studentCode: string }> };
      expect(shortBody.data.map((c) => c.studentCode).sort()).toEqual(
        [`Q1-${suffix}`, `Q3-${suffix}`].sort(),
      );

      const byUpper = await queryCandidates('?name=FERN').expect(200);
      const upperBody = byUpper.body as { data: Array<{ studentCode: string }> };
      expect(upperBody.data.map((c) => c.studentCode)).toEqual([`Q1-${suffix}`]);
    });

    it('Q14: whitespace-only name is ignored', async () => {
      const withFilter = await queryCandidates('?name=%20%20&limit=100').expect(200);
      const withoutFilter = await queryCandidates('?limit=100').expect(200);

      const filteredBody = withFilter.body as { data: Array<{ studentCode: string }> };
      const unfilteredBody = withoutFilter.body as { data: Array<{ studentCode: string }> };
      expect(filteredBody.data.map((c) => c.studentCode)).toEqual(
        unfilteredBody.data.map((c) => c.studentCode),
      );
    });

    it('Q15: the name filter combines with other filters via AND', async () => {
      const res = await queryCandidates('?name=bruno&programCode=5001').expect(200);
      const body = res.body as { data: Array<{ studentCode: string }> };
      const codes = body.data.map((c) => c.studentCode).sort();
      expect(codes).toEqual([`Q1-${suffix}`, `Q3-${suffix}`].sort());
    });

    it('Q16: the paginated/name/status flow remains read-only', async () => {
      const before = await prisma.candidate.count({
        where: { student_code: { in: usedStudentCodes } },
      });

      await queryCandidates(`?name=PG-${suffix}&limit=1&page=2`).expect(200);
      await queryCandidates(`?studentCode=${inactiveStudentCode}&status=INACTIVE`).expect(200);
      await queryCandidates('?name=bruno&limit=10&page=1').expect(200);

      const after = await prisma.candidate.count({
        where: { student_code: { in: usedStudentCodes } },
      });
      expect(after).toBe(before);
    });
  });

  describe('PUT /candidates/:id/desactive', () => {
    const deactivateCandidate = (id: string, token: string = adminToken) =>
      request(app.getHttpServer())
        .put(`/api/v1/candidates/${id}/desactive`)
        .set('Authorization', `Bearer ${token}`);

    const registerCandidate = async (): Promise<{ id: string; studentCode: string }> => {
      const payload = validCandidate();
      payload.studentCode = `DEL-${suffix}-${usedStudentCodes.length}`;
      payload.identificationNumber = `IDDEL-${suffix}-${usedStudentCodes.length}`;
      const res = await register(payload, adminToken).expect(201);
      usedStudentCodes.push(payload.studentCode);
      return { id: (res.body as { id: string }).id, studentCode: payload.studentCode };
    };

    it('E1: an authenticated administrator deactivates a candidate with 204 and no body', async () => {
      const { id } = await registerCandidate();

      const del = await deactivateCandidate(id).expect(204);

      expect(del.body).toEqual({});
    });

    it('E2: does not physically delete the record and marks it INACTIVE', async () => {
      const { id } = await registerCandidate();
      const before = await prisma.candidate.findUnique({ where: { id } });
      const countBefore = await prisma.candidate.count({
        where: { student_code: { in: usedStudentCodes } },
      });

      await deactivateCandidate(id).expect(204);

      const after = await prisma.candidate.findUnique({ where: { id } });
      const countAfter = await prisma.candidate.count({
        where: { student_code: { in: usedStudentCodes } },
      });

      expect(after).not.toBeNull();
      expect(after?.status).toBe('INACTIVE');
      expect(after?.first_name).toBe(before?.first_name);
      expect(after?.last_name).toBe(before?.last_name);
      expect(after?.student_code).toBe(before?.student_code);
      expect(after?.program_code).toBe(before?.program_code);
      expect(after?.identification_number).toBe(before?.identification_number);
      expect(countAfter).toBe(countBefore);
    });

    it('E3: a deactivated candidate is returned by default with INACTIVE status', async () => {
      const { id, studentCode } = await registerCandidate();

      await deactivateCandidate(id).expect(204);

      const byDefault = await request(app.getHttpServer())
        .get(`/api/v1/candidates?studentCode=${studentCode}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const defaultBody = byDefault.body as {
        data: Array<{ studentCode: string; status: string }>;
      };
      expect(defaultBody.data).toHaveLength(1);
      expect(defaultBody.data[0].status).toBe('INACTIVE');

      const activeOnly = await request(app.getHttpServer())
        .get(`/api/v1/candidates?studentCode=${studentCode}&status=ACTIVE`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect((activeOnly.body as { data: unknown[] }).data).toEqual([]);
    });

    it('E4: a repeated deactivation is idempotent and returns 204 again', async () => {
      const { id } = await registerCandidate();

      await deactivateCandidate(id).expect(204);
      await deactivateCandidate(id).expect(204);
    });

    it('E5: rejects unauthenticated requests with 401', async () => {
      const { id } = await registerCandidate();

      await request(app.getHttpServer()).put(`/api/v1/candidates/${id}/desactive`).expect(401);
    });

    it('E6: rejects an invalid token with 401', async () => {
      const { id } = await registerCandidate();

      const res = await deactivateCandidate(id, 'not-a-real-token').expect(401);

      expect(res.body).toMatchObject({ statusCode: 401 });
    });

    it('E7: rejects a non-admin role with 403', async () => {
      const { id } = await registerCandidate();

      const res = await deactivateCandidate(id, auditorToken).expect(403);

      expect(res.body).toMatchObject({ statusCode: 403 });
    });

    it('E8: returns 404 with CANDIDATE_NOT_FOUND for an unknown id', async () => {
      const res = await deactivateCandidate(crypto.randomUUID()).expect(404);

      expect(res.body).toMatchObject({ statusCode: 404, error: 'CANDIDATE_NOT_FOUND' });
    });

    it('E9: rejects a malformed id with 400', async () => {
      const res = await deactivateCandidate('not-a-uuid').expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E10: does not modify unrelated candidate fields', async () => {
      const { id } = await registerCandidate();
      const before = await prisma.candidate.findUnique({ where: { id } });

      await deactivateCandidate(id).expect(204);

      const after = await prisma.candidate.findUnique({ where: { id } });
      expect(after?.status).toBe('INACTIVE');
      expect(after?.first_name).toBe(before?.first_name);
      expect(after?.last_name).toBe(before?.last_name);
      expect(after?.student_code).toBe(before?.student_code);
      expect(after?.program_code).toBe(before?.program_code);
      expect(after?.identification_number).toBe(before?.identification_number);
      expect(after?.created_at?.getTime()).toBe(before?.created_at?.getTime());
    });

    it('D-X1: deactivating does not set deleted_at nor remove the row', async () => {
      const { id } = await registerCandidate();

      await deactivateCandidate(id).expect(204);

      const row = await prisma.candidate.findUnique({ where: { id } });
      expect(row).not.toBeNull();
      expect(row!.deleted_at).toBeNull();
      expect(row!.status).toBe('INACTIVE');
    });

    it('D-X2: deactivating a logically deleted candidate returns 404', async () => {
      const { id } = await registerCandidate();
      await request(app.getHttpServer())
        .delete(`/api/v1/candidates/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      const res = await deactivateCandidate(id).expect(404);

      expect(res.body).toMatchObject({ statusCode: 404, error: 'CANDIDATE_NOT_FOUND' });
      const row = await prisma.candidate.findUnique({ where: { id } });
      expect(row!.status).toBe('ACTIVE');
    });
  });

  describe('PUT /candidates/:id', () => {
    // VOTER role is not defined in the current RoleName value object, so only
    // AUDITOR is exercised for the forbidden scenarios (spec business rule 1).
    const updateCandidate = (id: string, payload: CandidatePayload, token: string = adminToken) =>
      request(app.getHttpServer())
        .put(`/api/v1/candidates/${id}`)
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
      const id = await registerAndGetId(patchSeed(`PUT1-${suffix}`, `IDPUT1-${suffix}`));
      usedStudentCodes.push(`PUT1-${suffix}`);

      const res = await updateCandidate(id, {
        firstName: 'Updated',
        lastName: 'Name',
        programCode: '2710',
        identificationNumber: 'IDPUT1-NEW',
      }).expect(200);

      expect(res.body).toMatchObject({
        id,
        firstName: 'Updated',
        lastName: 'Name',
        programCode: '2710',
        identificationNumber: 'IDPUT1-NEW',
        status: 'ACTIVE',
      });
    });

    it('E2: partial update preserves omitted fields and immutable values', async () => {
      const id = await registerAndGetId(patchSeed(`PUT2-${suffix}`, `IDPUT2-${suffix}`));
      usedStudentCodes.push(`PUT2-${suffix}`);

      const before = await prisma.candidate.findUnique({ where: { id } });

      const res = await updateCandidate(id, { firstName: 'OnlyFirst' }).expect(200);
      const body = res.body as Record<string, unknown>;

      expect(body.firstName).toBe('OnlyFirst');
      expect(body.lastName).toBe('Cand');
      expect(body.programCode).toBe('1234');
      expect(body.identificationNumber).toBe(`IDPUT2-${suffix}`);
      expect(body.studentCode).toBe(`PUT2-${suffix}`);
      expect(body.status).toBe('ACTIVE');
      expect(body.createdAt).toBe(before?.created_at?.toISOString());
    });

    it('E3: partial update of only identificationNumber', async () => {
      const id = await registerAndGetId(patchSeed(`PUT3-${suffix}`, `IDPUT3-${suffix}`));
      usedStudentCodes.push(`PUT3-${suffix}`);

      const res = await updateCandidate(id, { identificationNumber: 'IDPUT3-NEW' }).expect(200);
      const body = res.body as Record<string, unknown>;

      expect(body.identificationNumber).toBe('IDPUT3-NEW');
      expect(body.firstName).toBe('Patch');
      expect(body.lastName).toBe('Cand');
    });

    it('E4: rejects unauthenticated requests with 401', async () => {
      const id = await registerAndGetId(patchSeed(`PUT4-${suffix}`, `IDPUT4-${suffix}`));
      usedStudentCodes.push(`PUT4-${suffix}`);

      await request(app.getHttpServer())
        .put(`/api/v1/candidates/${id}`)
        .send({ firstName: 'X' })
        .expect(401);
    });

    it('E5: rejects an invalid token with 401', async () => {
      const id = await registerAndGetId(patchSeed(`PUT5-${suffix}`, `IDPUT5-${suffix}`));
      usedStudentCodes.push(`PUT5-${suffix}`);

      const res = await updateCandidate(id, { firstName: 'X' }, 'not-a-real-token').expect(401);
      expect(res.body).toMatchObject({ statusCode: 401 });
    });

    it('E6: rejects a non-admin role (AUDITOR) with 403', async () => {
      const id = await registerAndGetId(patchSeed(`PUT6-${suffix}`, `IDPUT6-${suffix}`));
      usedStudentCodes.push(`PUT6-${suffix}`);

      const res = await updateCandidate(id, { firstName: 'X' }, auditorToken).expect(403);
      expect(res.body).toMatchObject({ statusCode: 403 });
    });

    it('E8: returns 404 with CANDIDATE_NOT_FOUND for an unknown id', async () => {
      const res = await updateCandidate(crypto.randomUUID(), { firstName: 'Updated' }).expect(404);

      expect(res.body).toMatchObject({ statusCode: 404, error: 'CANDIDATE_NOT_FOUND' });
    });

    it('E9: treats a logically deleted candidate as not found (404)', async () => {
      const id = await registerAndGetId(patchSeed(`PUT9-${suffix}`, `IDPUT9-${suffix}`));
      usedStudentCodes.push(`PUT9-${suffix}`);

      await request(app.getHttpServer())
        .put(`/api/v1/candidates/${id}/desactive`)
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
      const id = await registerAndGetId(patchSeed(`PUT11-${suffix}`, `IDPUT11-${suffix}`));
      usedStudentCodes.push(`PUT11-${suffix}`);

      const res = await updateCandidate(id, { firstName: 'X' }).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E12: rejects a firstName longer than 100 characters with 400', async () => {
      const id = await registerAndGetId(patchSeed(`PUT12-${suffix}`, `IDPUT12-${suffix}`));
      usedStudentCodes.push(`PUT12-${suffix}`);

      const res = await updateCandidate(id, { firstName: 'a'.repeat(101) }).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E13: rejects a lastName shorter than 2 characters with 400', async () => {
      const id = await registerAndGetId(patchSeed(`PUT13-${suffix}`, `IDPUT13-${suffix}`));
      usedStudentCodes.push(`PUT13-${suffix}`);

      const res = await updateCandidate(id, { lastName: 'Y' }).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E14: rejects an invalid program code format with 400', async () => {
      const id = await registerAndGetId(patchSeed(`PUT14-${suffix}`, `IDPUT14-${suffix}`));
      usedStudentCodes.push(`PUT14-${suffix}`);

      const res = await updateCandidate(id, { programCode: '271' }).expect(400);
      const body = res.body as { statusCode: number; message: string | string[] };
      expect(body.statusCode).toBe(400);
      expect(body.message).toEqual(
        expect.arrayContaining(['Program code must contain exactly four digits.']),
      );
    });

    it('E15: rejects an empty identificationNumber with 400', async () => {
      const id = await registerAndGetId(patchSeed(`PUT15-${suffix}`, `IDPUT15-${suffix}`));
      usedStudentCodes.push(`PUT15-${suffix}`);

      const res = await updateCandidate(id, { identificationNumber: '' }).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E16: rejects unknown/system-managed fields in the body with 400', async () => {
      const id = await registerAndGetId(patchSeed(`PUT16-${suffix}`, `IDPUT16-${suffix}`));
      usedStudentCodes.push(`PUT16-${suffix}`);

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
      expect(row?.student_code).toBe(`PUT16-${suffix}`);
      expect(row?.status).toBe('ACTIVE');
    });

    it('E17: rejects a duplicate identificationNumber with 409 and does not change the row', async () => {
      const idA = await registerAndGetId(patchSeed(`PUT17A-${suffix}`, `IDPUT17A-${suffix}`));
      await registerAndGetId(patchSeed(`PUT17B-${suffix}`, `IDPUT17B-${suffix}`));
      usedStudentCodes.push(`PUT17A-${suffix}`, `PUT17B-${suffix}`);

      const res = await updateCandidate(idA, {
        identificationNumber: `IDPUT17B-${suffix}`,
      }).expect(409);

      expect(res.body).toMatchObject({ statusCode: 409, error: 'CANDIDATE_CONFLICT' });

      const rowA = await prisma.candidate.findUnique({ where: { id: idA } });
      expect(rowA?.identification_number).toBe(`IDPUT17A-${suffix}`);
    });

    it('E18: the response exposes exactly the CandidateResponseDto contract', async () => {
      const id = await registerAndGetId(patchSeed(`PUT18-${suffix}`, `IDPUT18-${suffix}`));
      usedStudentCodes.push(`PUT18-${suffix}`);

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
          'companionFirstName',
          'companionLastName',
          'companionStudentCode',
          'companionProgramCode',
          'companionIdentification',
          'createdAt',
        ].sort(),
      );
    });

    it('E19: createdAt is serialized as an ISO string', async () => {
      const id = await registerAndGetId(patchSeed(`PUT19-${suffix}`, `IDPUT19-${suffix}`));
      usedStudentCodes.push(`PUT19-${suffix}`);

      const res = await updateCandidate(id, { firstName: 'Iso' }).expect(200);
      const body = res.body as Record<string, unknown>;
      expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('E20: repeated identical updates are idempotent', async () => {
      const id = await registerAndGetId(patchSeed(`PUT20-${suffix}`, `IDPUT20-${suffix}`));
      usedStudentCodes.push(`PUT20-${suffix}`);

      const first = await updateCandidate(id, { firstName: 'Same' }).expect(200);
      const second = await updateCandidate(id, { firstName: 'Same' }).expect(200);
      const firstBody = first.body as Record<string, unknown>;
      const secondBody = second.body as Record<string, unknown>;

      expect(secondBody.firstName).toBe('Same');
      expect(secondBody.firstName).toBe(firstBody.firstName);
    });

    it('E21: failed requests do not create or modify records', async () => {
      const before = await prisma.candidate.count({
        where: { student_code: { in: usedStudentCodes } },
      });

      const id = await registerAndGetId(patchSeed(`PUT21-${suffix}`, `IDPUT21-${suffix}`));
      usedStudentCodes.push(`PUT21-${suffix}`);

      const beforeRow = await prisma.candidate.findUnique({ where: { id } });

      await updateCandidate(id, { firstName: 'X' }).expect(400); // too short
      await updateCandidate(id, { firstName: 'Valid' }, 'not-a-real-token').expect(401);
      await updateCandidate(id, { firstName: 'Valid' }, auditorToken).expect(403);

      const after = await prisma.candidate.count({
        where: { student_code: { in: usedStudentCodes } },
      });
      expect(after).toBe(before + 1);

      const afterRow = await prisma.candidate.findUnique({ where: { id } });
      expect(afterRow?.first_name).toBe(beforeRow?.first_name);
    });

    it('E22: PUT a single companion field preserves other companion values', async () => {
      const code = `PUT22-${suffix}`;
      const idn = `IDPUT22-${suffix}`;
      const createRes = await register(
        {
          ...validCandidate(),
          studentCode: code,
          identificationNumber: idn,
          companionFirstName: 'Maria',
          companionLastName: 'Lopez',
          companionStudentCode: '20209999',
          companionProgramCode: '9999',
          companionIdentification: '2000000000',
        },
        adminToken,
      ).expect(201);
      usedStudentCodes.push(code);
      const id = (createRes.body as { id: string }).id;

      const res = await updateCandidate(id, { companionFirstName: 'MariaUpdated' }).expect(200);
      const body = res.body as CandidatePayload;

      expect(body.companionFirstName).toBe('MariaUpdated');
      expect(body.companionLastName).toBe('Lopez');
      expect(body.companionStudentCode).toBe('20209999');
      expect(body.companionProgramCode).toBe('9999');
      expect(body.companionIdentification).toBe('2000000000');

      const row = await prisma.candidate.findUnique({ where: { id } });
      expect(row?.companion_first_name).toBe('MariaUpdated');
      expect(row?.companion_last_name).toBe('Lopez');
    });

    it('E23: PUT with explicit null companionFirstName preserves the value', async () => {
      const code = `PUT23-${suffix}`;
      const idn = `IDPUT23-${suffix}`;
      const createRes = await register(
        {
          ...validCandidate(),
          studentCode: code,
          identificationNumber: idn,
          companionFirstName: 'Maria',
          companionLastName: 'Lopez',
          companionStudentCode: '20209999',
          companionProgramCode: '9999',
          companionIdentification: '2000000000',
        },
        adminToken,
      ).expect(201);
      usedStudentCodes.push(code);
      const id = (createRes.body as { id: string }).id;

      const res = await updateCandidate(id, { companionFirstName: null }).expect(200);
      const body = res.body as CandidatePayload;

      expect(body.companionFirstName).toBe('Maria');

      const row = await prisma.candidate.findUnique({ where: { id } });
      expect(row?.companion_first_name).toBe('Maria');
    });

    it('E24: PUT with explicit null firstName preserves the value', async () => {
      const id = await registerAndGetId(patchSeed(`PUT24-${suffix}`, `IDPUT24-${suffix}`));
      usedStudentCodes.push(`PUT24-${suffix}`);

      const res = await updateCandidate(id, { firstName: null }).expect(200);
      const body = res.body as CandidatePayload;

      expect(body.firstName).toBe('Patch');

      const row = await prisma.candidate.findUnique({ where: { id } });
      expect(row?.first_name).toBe('Patch');
    });

    it('E25: PUT with invalid companionProgramCode returns 400', async () => {
      const id = await registerAndGetId(patchSeed(`PUT25-${suffix}`, `IDPUT25-${suffix}`));
      usedStudentCodes.push(`PUT25-${suffix}`);

      const res = await updateCandidate(id, { companionProgramCode: '12' }).expect(400);

      const body = res.body as { statusCode: number; message: string | string[] };
      expect(body.statusCode).toBe(400);
      expect(body.message).toEqual(
        expect.arrayContaining(['Companion program code must contain exactly four digits.']),
      );
    });
  });

  describe('PUT /candidates/:id/active', () => {
    const reactivate = (id: string, token: string = adminToken) =>
      request(app.getHttpServer())
        .put(`/api/v1/candidates/${id}/active`)
        .set('Authorization', `Bearer ${token}`);

    let reactCounter = 0;
    const registerInactive = async (): Promise<{ id: string; studentCode: string }> => {
      reactCounter += 1;
      const code = `REACT-${suffix}-${reactCounter}`;
      const idn = `IDREACT-${suffix}-${reactCounter}`;
      const payload = validCandidate();
      payload.studentCode = code;
      payload.identificationNumber = idn;
      const res = await register(payload, adminToken).expect(201);
      usedStudentCodes.push(code);
      const id = (res.body as { id: string }).id;
      await prisma.candidate.update({ where: { id }, data: { status: 'INACTIVE' } });
      return { id, studentCode: code };
    };

    it('E1: ADMIN reactivates an INACTIVE candidate -> 200 with ACTIVE status', async () => {
      const { id, studentCode } = await registerInactive();

      const res = await reactivate(id).expect(200);

      expect(res.body).toMatchObject({ id, status: 'ACTIVE', studentCode });

      const row = await prisma.candidate.findUnique({ where: { id } });
      expect(row!.status).toBe('ACTIVE');
    });

    it('E2: unauthenticated request -> 401', async () => {
      const { id } = await registerInactive();

      const res = await request(app.getHttpServer())
        .put(`/api/v1/candidates/${id}/active`)
        .expect(401);

      expect(res.body).toMatchObject({ statusCode: 401 });
    });

    it('E3: invalid token -> 401', async () => {
      const { id } = await registerInactive();

      const res = await reactivate(id, 'not-a-real-token').expect(401);

      expect(res.body).toMatchObject({ statusCode: 401 });
    });

    it('E4: AUDITOR -> 403', async () => {
      const { id } = await registerInactive();

      const res = await reactivate(id, auditorToken).expect(403);

      expect(res.body).toMatchObject({ statusCode: 403 });
    });

    it('E5: invalid id format -> 400', async () => {
      const res = await reactivate('not-a-uuid').expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E6: unknown valid UUID -> 404 CANDIDATE_NOT_FOUND', async () => {
      const res = await reactivate(crypto.randomUUID()).expect(404);

      expect(res.body).toMatchObject({ statusCode: 404, error: 'CANDIDATE_NOT_FOUND' });
    });

    it('E7: already ACTIVE candidate -> 409 CANDIDATE_ALREADY_ACTIVE', async () => {
      reactCounter += 1;
      const code = `REACTACT-${suffix}-${reactCounter}`;
      const idn = `IDREACTACT-${suffix}-${reactCounter}`;
      const payload = validCandidate();
      payload.studentCode = code;
      payload.identificationNumber = idn;
      const res = await register(payload, adminToken).expect(201);
      usedStudentCodes.push(code);
      const id = (res.body as { id: string }).id;

      const r = await reactivate(id).expect(409);

      expect(r.body).toMatchObject({ statusCode: 409, error: 'CANDIDATE_ALREADY_ACTIVE' });
    });

    it('E8: id and other fields unchanged on reactivation', async () => {
      const { id } = await registerInactive();
      const before = await prisma.candidate.findUnique({ where: { id } });

      await reactivate(id).expect(200);

      const after = await prisma.candidate.findUnique({ where: { id } });
      expect(after!.id).toBe(before!.id);
      expect(after!.first_name).toBe(before!.first_name);
      expect(after!.last_name).toBe(before!.last_name);
      expect(after!.student_code).toBe(before!.student_code);
      expect(after!.identification_number).toBe(before!.identification_number);
      expect(after!.status).toBe('ACTIVE');
      expect(before!.status).toBe('INACTIVE');
    });

    it('E9: flips from INACTIVE to ACTIVE in the default list after reactivation', async () => {
      const { id, studentCode } = await registerInactive();

      const before = await request(app.getHttpServer())
        .get(`/api/v1/candidates?studentCode=${studentCode}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const beforeBody = before.body as { data: Array<{ id: string; status: string }> };
      expect(beforeBody.data).toHaveLength(1);
      expect(beforeBody.data[0].id).toBe(id);
      expect(beforeBody.data[0].status).toBe('INACTIVE');

      await reactivate(id).expect(200);

      const visible = await request(app.getHttpServer())
        .get(`/api/v1/candidates?studentCode=${studentCode}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const visibleBody = visible.body as { data: Array<{ id: string; status: string }> };
      expect(visibleBody.data).toHaveLength(1);
      expect(visibleBody.data[0].id).toBe(id);
      expect(visibleBody.data[0].status).toBe('ACTIVE');
    });

    it('E10: failed requests do not create or modify records', async () => {
      const before = await prisma.candidate.count({
        where: { student_code: { in: usedStudentCodes } },
      });

      const { id } = await registerInactive();
      const beforeRow = await prisma.candidate.findUnique({ where: { id } });

      await reactivate(id, 'not-a-real-token').expect(401);
      await reactivate(id, auditorToken).expect(403);
      await reactivate(crypto.randomUUID()).expect(404);

      const after = await prisma.candidate.count({
        where: { student_code: { in: usedStudentCodes } },
      });
      expect(after).toBe(before + 1);

      const afterRow = await prisma.candidate.findUnique({ where: { id } });
      expect(afterRow!.status).toBe(beforeRow!.status);
    });

    it('A-X1: activating a logically deleted candidate returns 404 (no resurrection)', async () => {
      const { id } = await registerInactive();
      await request(app.getHttpServer())
        .delete(`/api/v1/candidates/${id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      const res = await reactivate(id).expect(404);

      expect(res.body).toMatchObject({ statusCode: 404, error: 'CANDIDATE_NOT_FOUND' });
      const row = await prisma.candidate.findUnique({ where: { id } });
      expect(row!.deleted_at).not.toBeNull();
      expect(row!.status).toBe('INACTIVE');
    });

    it('A-X2: activating an INACTIVE non-deleted candidate still returns 200 and ACTIVE', async () => {
      const { id } = await registerInactive();

      const res = await reactivate(id).expect(200);

      expect(res.body).toMatchObject({ id, status: 'ACTIVE' });
      const row = await prisma.candidate.findUnique({ where: { id } });
      expect(row!.deleted_at).toBeNull();
      expect(row!.status).toBe('ACTIVE');
    });
  });

  describe('DELETE /candidates/:id', () => {
    const deleteCandidate = (id: string, token: string = adminToken) =>
      request(app.getHttpServer())
        .delete(`/api/v1/candidates/${id}`)
        .set('Authorization', `Bearer ${token}`);

    let deleteCounter = 0;
    const registerActive = async (): Promise<{ id: string; studentCode: string }> => {
      deleteCounter += 1;
      const code = `SDEL-${suffix}-${deleteCounter}`;
      const idn = `IDSDEL-${suffix}-${deleteCounter}`;
      const payload = validCandidate();
      payload.studentCode = code;
      payload.identificationNumber = idn;
      const res = await register(payload, adminToken).expect(201);
      usedStudentCodes.push(code);
      return { id: (res.body as { id: string }).id, studentCode: code };
    };

    it('CD-1: an authenticated administrator deletes a candidate with 204 and no body', async () => {
      const { id } = await registerActive();

      const del = await deleteCandidate(id).expect(204);

      expect(del.body).toEqual({});
    });

    it('CD-2: performs a logical delete and keeps the remaining columns intact', async () => {
      const { id } = await registerActive();
      const before = await prisma.candidate.findUnique({ where: { id } });

      await deleteCandidate(id).expect(204);

      const after = await prisma.candidate.findUnique({ where: { id } });
      expect(after).not.toBeNull();
      expect(after!.deleted_at).toBeInstanceOf(Date);
      expect(after!.status).toBe(before!.status);
      expect(after!.first_name).toBe(before!.first_name);
      expect(after!.last_name).toBe(before!.last_name);
      expect(after!.student_code).toBe(before!.student_code);
      expect(after!.program_code).toBe(before!.program_code);
      expect(after!.identification_number).toBe(before!.identification_number);
    });

    it('CD-3: a deleted candidate is excluded from candidate query results', async () => {
      const { id, studentCode } = await registerActive();
      await deleteCandidate(id).expect(204);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/candidates?studentCode=${studentCode}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect((res.body as { data: unknown[] }).data).toEqual([]);
    });

    it('CD-4: a deleted candidate stays excluded even when filtering by status', async () => {
      const { id, studentCode } = await registerActive();
      await deleteCandidate(id).expect(204);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/candidates?studentCode=${studentCode}&status=ACTIVE`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect((res.body as { data: unknown[] }).data).toEqual([]);
    });

    it('CD-5: a second DELETE returns 404 CANDIDATE_NOT_FOUND', async () => {
      const { id } = await registerActive();
      await deleteCandidate(id).expect(204);

      const res = await deleteCandidate(id).expect(404);

      expect(res.body).toMatchObject({ statusCode: 404, error: 'CANDIDATE_NOT_FOUND' });
    });

    it('CD-6: returns 404 for an unknown id', async () => {
      const res = await deleteCandidate(crypto.randomUUID()).expect(404);

      expect(res.body).toMatchObject({ statusCode: 404, error: 'CANDIDATE_NOT_FOUND' });
    });

    it('CD-7: rejects a malformed id with 400', async () => {
      const res = await deleteCandidate('not-a-uuid').expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('CD-8: rejects unauthenticated and invalid-token requests with 401', async () => {
      const { id } = await registerActive();

      await request(app.getHttpServer()).delete(`/api/v1/candidates/${id}`).expect(401);
      await deleteCandidate(id, 'not-a-real-token').expect(401);
    });

    it('CD-9: rejects a non-admin role (AUDITOR) with 403', async () => {
      const { id } = await registerActive();

      const res = await deleteCandidate(id, auditorToken).expect(403);

      expect(res.body).toMatchObject({ statusCode: 403 });
    });

    it('CD-10: failed requests do not modify rows', async () => {
      const { id } = await registerActive();
      const countBefore = await prisma.candidate.count({
        where: { student_code: { in: usedStudentCodes } },
      });

      await deleteCandidate(id, 'not-a-real-token').expect(401);
      await deleteCandidate(id, auditorToken).expect(403);
      await deleteCandidate(crypto.randomUUID()).expect(404);

      const afterRow = await prisma.candidate.findUnique({ where: { id } });
      const countAfter = await prisma.candidate.count({
        where: { student_code: { in: usedStudentCodes } },
      });
      expect(afterRow!.deleted_at).toBeNull();
      expect(countAfter).toBe(countBefore);
    });

    it('CD-11: deleting does not create additional records', async () => {
      const countBefore = await prisma.candidate.count({
        where: { student_code: { in: usedStudentCodes } },
      });

      const { id } = await registerActive();
      await deleteCandidate(id).expect(204);

      const countAfter = await prisma.candidate.count({
        where: { student_code: { in: usedStudentCodes } },
      });
      expect(countAfter).toBe(countBefore + 1);
    });

    it('CD-12: an INACTIVE non-deleted candidate is not affected', async () => {
      const { id, studentCode } = await registerActive();
      await prisma.candidate.update({ where: { id }, data: { status: 'INACTIVE' } });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/candidates?studentCode=${studentCode}&status=INACTIVE`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const data = (res.body as { data: Array<{ id: string }> }).data;
      expect(data.map((c) => c.id)).toContain(id);
      const row = await prisma.candidate.findUnique({ where: { id } });
      expect(row!.deleted_at).toBeNull();
    });
  });

  describe('Legacy candidate routes (must 404)', () => {
    const legacyId = crypto.randomUUID();

    it('L1: the old PATCH /candidates/:id update method is no longer registered (404)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/candidates/${legacyId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(res.body).toMatchObject({ statusCode: 404 });
    });

    it('L2: the old PATCH /candidates/:id/desactive method is no longer registered (404)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/candidates/${legacyId}/desactive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(res.body).toMatchObject({ statusCode: 404 });
    });

    it('L3: the old /candidates/:id/reactivate activation path is no longer registered (404)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/candidates/${legacyId}/reactivate`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(res.body).toMatchObject({ statusCode: 404 });
    });

    it('L4: the old PATCH /candidates/:id/active method is no longer registered (404)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/candidates/${legacyId}/active`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(res.body).toMatchObject({ statusCode: 404 });
    });
  });

  describe('Swagger / OpenAPI', () => {
    it('S1-S4: the generated OpenAPI document exposes only the new methods and paths', () => {
      const config = new DocumentBuilder()
        .setTitle('Votium API')
        .setDescription('Electronic voting system API')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
      const document = SwaggerModule.createDocument(app, config);

      // S1: update is documented as PUT on /candidates/{id}; the old PATCH method is gone.
      const updatePathKey = Object.keys(document.paths).find((p) => p.endsWith('/candidates/{id}'));
      expect(updatePathKey).toBeDefined();
      const updatePathItem = document.paths[updatePathKey!] as {
        put?: SwaggerOperationShape;
        patch?: SwaggerOperationShape;
      };
      expect(updatePathItem.put).toBeDefined();
      expect(updatePathItem.patch).toBeUndefined();
      expect(updatePathItem.put!.tags).toContain('candidates');
      expect(updatePathItem.put!.security).toEqual([{ bearer: [] }]);
      expect(updatePathItem.put!.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'id', in: 'path', required: true }),
        ]),
      );
      const requestSchemaRef =
        updatePathItem.put!.requestBody!.content['application/json'].schema.$ref;
      expect(requestSchemaRef).toBe('#/components/schemas/UpdateCandidateDto');
      const requestSchema = document.components?.schemas?.['UpdateCandidateDto'] as
        | { properties?: Record<string, unknown> }
        | undefined;
      expect(requestSchema).toBeDefined();
      const editable = [
        'firstName',
        'lastName',
        'programCode',
        'identificationNumber',
        'companionFirstName',
        'companionLastName',
        'companionStudentCode',
        'companionProgramCode',
        'companionIdentification',
      ];
      expect(Object.keys(requestSchema!.properties ?? {}).sort()).toEqual(editable.slice().sort());
      for (const forbidden of ['id', 'studentCode', 'status', 'createdAt']) {
        expect(requestSchema!.properties?.[forbidden]).toBeUndefined();
      }
      for (const status of ['200', '400', '401', '403', '404', '409']) {
        expect(updatePathItem.put!.responses[status]).toBeDefined();
      }

      // S2: deactivation is documented as PUT on /candidates/{id}/desactive; DELETE is gone.
      const desactivePathKey = Object.keys(document.paths).find((p) =>
        p.endsWith('/candidates/{id}/desactive'),
      );
      expect(desactivePathKey).toBeDefined();
      const desactivePathItem = document.paths[desactivePathKey!] as {
        put?: SwaggerOperationShape;
        delete?: SwaggerOperationShape;
      };
      expect(desactivePathItem.put).toBeDefined();
      expect(desactivePathItem.delete).toBeUndefined();
      expect(desactivePathItem.put!.tags).toContain('candidates');
      expect(desactivePathItem.put!.security).toEqual([{ bearer: [] }]);
      expect(desactivePathItem.put!.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'id', in: 'path', required: true }),
        ]),
      );
      for (const status of ['204', '400', '401', '403', '404']) {
        expect(desactivePathItem.put!.responses[status]).toBeDefined();
      }

      // S3: activation is documented as PUT on /candidates/{id}/active.
      const activePathKey = Object.keys(document.paths).find((p) =>
        p.endsWith('/candidates/{id}/active'),
      );
      expect(activePathKey).toBeDefined();
      const activePathItem = document.paths[activePathKey!] as {
        put?: SwaggerOperationShape;
      };
      expect(activePathItem.put).toBeDefined();
      expect(activePathItem.put!.tags).toContain('candidates');
      expect(activePathItem.put!.security).toEqual([{ bearer: [] }]);
      for (const status of ['200', '400', '401', '403', '404', '409']) {
        expect(activePathItem.put!.responses[status]).toBeDefined();
      }

      // S2b: /candidates/{id} now exposes DELETE for the logical deletion.
      const deleteOperation = (updatePathItem as { delete?: SwaggerOperationShape }).delete;
      expect(deleteOperation).toBeDefined();
      expect(deleteOperation!.tags).toContain('candidates');
      expect(deleteOperation!.security).toEqual([{ bearer: [] }]);
      expect(deleteOperation!.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'id', in: 'path', required: true }),
        ]),
      );
      for (const status of ['204', '400', '401', '403', '404']) {
        expect(deleteOperation!.responses[status]).toBeDefined();
      }

      // S4: registration of the CRUD methods is the expected one and the bearer scheme exists.
      expect(desactivePathItem.delete).toBeUndefined();
      expect((activePathItem as { delete?: SwaggerOperationShape }).delete).toBeUndefined();
      expect(deleteOperation).toBeDefined();
      expect(document.components?.securitySchemes?.bearer).toBeDefined();
    });

    it('S5: GET /candidates documents the query parameters and responses', () => {
      const config = new DocumentBuilder()
        .setTitle('Votium API')
        .setDescription('Electronic voting system API')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
      const document = SwaggerModule.createDocument(app, config);

      const queryPathKey = Object.keys(document.paths).find(
        (path) => path.endsWith('/candidates') && !path.includes('{'),
      );
      expect(queryPathKey).toBeDefined();
      const queryOperation = document.paths[queryPathKey!] as { get?: SwaggerOperationShape };
      expect(queryOperation.get).toBeDefined();

      const queryParameters = (queryOperation.get!.parameters ?? []).filter(
        (parameter) => parameter.in === 'query',
      );
      const queryNames = queryParameters.map((parameter) => parameter.name).sort();

      expect(queryNames).toEqual(
        [
          'firstName',
          'identificationNumber',
          'lastName',
          'limit',
          'name',
          'page',
          'programCode',
          'status',
          'studentCode',
        ].sort(),
      );
      expect(queryNames).not.toContain('studyPlanCode');
      expect(queryNames).not.toContain('includeInactive');
      expect(new Set(queryNames).size).toBe(queryNames.length);

      for (const status of ['200', '400', '401', '403']) {
        expect(queryOperation.get!.responses[status]).toBeDefined();
      }
      expect(queryOperation.get!.tags).toContain('candidates');
      expect(queryOperation.get!.security).toEqual([{ bearer: [] }]);
    });
  });
});
