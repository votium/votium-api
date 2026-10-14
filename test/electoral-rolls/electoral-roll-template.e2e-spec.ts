import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { App } from 'supertest/types';
import { parse } from 'csv-parse/sync';
import { envs } from '../../src/config';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { GlobalExceptionFilter } from '../../src/shared/exceptions/filters/global-exception.filter';
import {
  ASYNC_EMAIL_SERVICE_PORT,
  type AsyncEmailServicePort,
} from '../../src/modules/auth/application/ports/async-email-service.port';
import { NodeCryptoPasswordHasherService } from '../../src/modules/iam/infrastructure/services/node-crypto-password-hasher.service';
import { RoleName } from '../../src/modules/iam/domain/value-objects/role-name.vo';
import { UserStatus } from '../../src/modules/iam/domain/value-objects/user-status.vo';
import { buildAuthCookie, extractAuthCookie } from '../auth/auth-cookie.utils';

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

interface LoginResponseBody {
  sessionId: string;
}

interface SwaggerOperationShape {
  tags?: string[];
  parameters?: Array<{ name: string; in: string; required: boolean }>;
  security?: Array<{ cookie: string[] }>;
  responses: Record<string, { content?: Record<string, { schema: Record<string, unknown> }> }>;
}

describe('Electoral roll CSV template download (e2e)', () => {
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

  const codeA = `TPL-A-${suffix}`;

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
    return extractAuthCookie(verifyRes);
  };

  const completeElectorLogin = async (email: string, password: string): Promise<string> => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/electors/login')
      .send({ email, password })
      .expect(200);
    const sessionId = (loginRes.body as LoginResponseBody).sessionId;
    const code = emailService.last().code;
    const verifyRes = await request(app.getHttpServer())
      .post('/api/v1/auth/electors/mfa/verify')
      .send({ sessionId, code })
      .expect(201);
    return extractAuthCookie(verifyRes);
  };

  const download = (electionId: string, token?: string) => {
    const req = request(app.getHttpServer()).get(
      `/api/v1/elections/${electionId}/electoral-roll/template`,
    );
    return token ? req.set('Cookie', token) : req;
  };

  const seedElection = async (status: 'PENDING' | 'CLOSED' = 'PENDING'): Promise<string> => {
    const name = `E2E-TPL-${status}-${suffix}-${electionCounter++}`;
    const created = await prisma.election.create({
      data: {
        name,
        description: 'E2E electoral roll template election.',
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

  const seedElector = async (code: string, programCode = '2710') => {
    const created = await prisma.elector.create({
      data: {
        first_name: 'Template',
        last_name: 'Elector',
        email: `${code}-${suffix}@example.com`,
        password_hash: 'pbkdf2$placeholder',
        student_code: code,
        program_code: programCode,
        status: 'ACTIVE',
      },
    });
    usedStudentCodes.push(code);
    return created.id;
  };

  const importCsv = (electionId: string, csv: string, token: string) =>
    request(app.getHttpServer())
      .post(`/api/v1/elections/${electionId}/electoral-roll/import`)
      .set('Cookie', token)
      .attach('file', Buffer.from(csv, 'utf8'), {
        filename: 'plantilla_padron_electoral.csv',
        contentType: 'text/csv',
      });

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
      email: `e2e-tpl-admin-${suffix}@example.com`,
      password: 'SuperSecret123!',
    };
    auditorUser = {
      id: '',
      email: `e2e-tpl-auditor-${suffix}@example.com`,
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

    const createdElector = await prisma.elector.create({
      data: {
        first_name: 'E2E',
        last_name: 'Elector',
        email: `e2e-tpl-elector-${suffix}@example.com`,
        password_hash: await hasher.hash('SuperSecret123!'),
        student_code: `TPL-ELECTOR-${suffix}`,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    usedStudentCodes.push(`TPL-ELECTOR-${suffix}`);
    electorUser = {
      id: createdElector.id,
      email: createdElector.email,
      password: 'SuperSecret123!',
    };

    await seedElector(codeA);

    adminToken = await completeLogin(adminUser.email, adminUser.password);
    auditorToken = await completeLogin(auditorUser.email, auditorUser.password);
    electorToken = await completeElectorLogin(electorUser.email, electorUser.password);
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

  describe('Route and HTTP headers', () => {
    it('TC-01: an administrator downloads the template with 200', async () => {
      const electionId = await seedElection();

      await download(electionId, adminToken).expect(200);
    });

    it('TC-02: sets Content-Type to text/csv', async () => {
      const electionId = await seedElection();
      const res = await download(electionId, adminToken).expect(200);

      expect(res.headers['content-type']).toBe('text/csv');
    });

    it('TC-03: sets the exact Content-Disposition attachment header', async () => {
      const electionId = await seedElection();
      const res = await download(electionId, adminToken).expect(200);

      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="plantilla_padron_electoral.csv"',
      );
    });

    it('TC-04: returns the raw CSV body (not JSON)', async () => {
      const electionId = await seedElection();
      const res = await download(electionId, adminToken).expect(200);

      expect(res.text).toContain('studentCode,programCode');
      expect(() => {
        JSON.parse(res.text);
      }).toThrow();
    });

    it('TC-05: body is a two-row CSV whose first row holds the official headers', async () => {
      const electionId = await seedElection();
      const res = await download(electionId, adminToken).expect(200);

      const rows = parse(res.text, { relax_column_count: false }) as string[][];
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual(['studentCode', 'programCode']);
    });

    it('TC-06: the guidance row has one cell per header', async () => {
      const electionId = await seedElection();
      const res = await download(electionId, adminToken).expect(200);

      const [headers, descriptions] = parse(res.text, {
        relax_column_count: false,
      }) as string[][];
      expect(descriptions).toHaveLength(headers.length);
    });

    it('TC-07: guidance is Spanish text with no real elector data or PII', async () => {
      const electionId = await seedElection();
      const res = await download(electionId, adminToken).expect(200);

      const serialized = res.text.toLowerCase();
      for (const description of (parse(res.text, { relax_column_count: false }) as string[][])[1]) {
        expect(description).toMatch(/obligatorio/i);
      }
      expect(serialized).not.toContain('@example.com');
      expect(serialized).not.toContain('password');
      expect(serialized).not.toContain('token');
      expect(serialized).not.toContain(codeA.toLowerCase());
    });

    it('TC-08: output is deterministic across downloads', async () => {
      const electionId = await seedElection();
      const first = await download(electionId, adminToken).expect(200);
      const second = await download(electionId, adminToken).expect(200);

      expect(second.text).toBe(first.text);
    });
  });

  describe('Authentication and authorization', () => {
    it('AUTH-01: rejects a request without a token with 401', async () => {
      const electionId = await seedElection();

      await download(electionId).expect(401);
    });

    it('AUTH-02: rejects an invalid token with 401', async () => {
      const electionId = await seedElection();

      await download(electionId, buildAuthCookie('not-a-real-token')).expect(401);
    });

    it('AUTH-03: rejects an auditor (non-admin) with 403', async () => {
      const electionId = await seedElection();

      await download(electionId, auditorToken).expect(403);
    });

    it('AUTH-04: rejects an elector/voter token with 403', async () => {
      const electionId = await seedElection();

      await download(electionId, electorToken).expect(403);
    });
  });

  describe('Election resolution', () => {
    it('ELEC-01: an existing election can be downloaded regardless of lifecycle state', async () => {
      const pendingId = await seedElection('PENDING');
      const closedId = await seedElection('CLOSED');

      await download(pendingId, adminToken).expect(200);
      await download(closedId, adminToken).expect(200);
    });

    it('ELEC-02: a nonexistent election returns the standard not-found response', async () => {
      const res = await download('00000000-0000-4000-8000-000000000000', adminToken).expect(404);

      expect(res.body).toMatchObject({ statusCode: 404, error: 'ELECTION_NOT_FOUND' });
    });

    it('ELEC-03: a malformed election identifier returns 400', async () => {
      await download('not-a-uuid', adminToken).expect(400);
    });
  });

  describe('Read-only behavior', () => {
    it('SIDE-01: downloading does not create, update, or delete records', async () => {
      const electionId = await seedElection();

      const before = {
        elections: await prisma.election.count({ where: { id: electionId } }),
        rolls: await prisma.electoralRoll.count({ where: { election_id: electionId } }),
        electors: await prisma.elector.count({ where: { student_code: { in: usedStudentCodes } } }),
        auditEntries: await prisma.auditLog.count({ where: { user_id: adminUser.id } }),
      };

      await download(electionId, adminToken).expect(200);
      await download(electionId, adminToken).expect(200);

      const after = {
        elections: await prisma.election.count({ where: { id: electionId } }),
        rolls: await prisma.electoralRoll.count({ where: { election_id: electionId } }),
        electors: await prisma.elector.count({ where: { student_code: { in: usedStudentCodes } } }),
        auditEntries: await prisma.auditLog.count({ where: { user_id: adminUser.id } }),
      };

      expect(after).toEqual(before);
    });
  });

  describe('Import compatibility (round-trip)', () => {
    it('IMP-01: a completed template imports the data row and skips header + guidance', async () => {
      const electionId = await seedElection('PENDING');

      const template = await download(electionId, adminToken).expect(200);
      const csv = `${template.text.trimEnd()}\n${codeA},2710\n`;

      const res = await importCsv(electionId, csv, adminToken).expect(200);

      expect(res.body).toEqual(
        expect.objectContaining({
          totalRows: 1,
          registered: 1,
          alreadyRegistered: 0,
          notFound: 0,
          invalidRows: 0,
          errors: [],
        }),
      );
    });

    it('IMP-02: structural rows are not counted and data row errors keep 1-based positions', async () => {
      const electionId = await seedElection('PENDING');

      const template = await download(electionId, adminToken).expect(200);
      const csv = `${template.text.trimEnd()}\n${codeA},2710\nGHOST-1,2710\n`;

      const res = await importCsv(electionId, csv, adminToken).expect(200);

      expect(res.body).toEqual(
        expect.objectContaining({
          totalRows: 2,
          registered: 1,
          notFound: 1,
          errors: [
            {
              row: 2,
              reason: 'Elector not found for the provided student code and program code.',
            },
          ],
        }),
      );
    });
  });

  describe('Swagger / OpenAPI', () => {
    it('SW-01..06: the generated OpenAPI document documents the endpoint', () => {
      const config = new DocumentBuilder()
        .setTitle('Votium API')
        .setDescription('Electronic voting system API')
        .setVersion('1.0')
        .addCookieAuth(envs.authCookieName)
        .build();
      const document = SwaggerModule.createDocument(app, config);

      const pathKey = Object.keys(document.paths).find((p) =>
        p.endsWith('/elections/{electionId}/electoral-roll/template'),
      );
      expect(pathKey).toBeDefined();
      const operation = document.paths[pathKey!].get as unknown as SwaggerOperationShape;
      expect(operation).toBeDefined();

      expect(operation.tags).toContain('electoral-rolls');

      expect(operation.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'electionId',
            in: 'path',
            required: true,
          }),
        ]),
      );

      expect(operation.security).toEqual([{ cookie: [] }]);

      const success = operation.responses['200'];
      expect(success).toBeDefined();
      expect(success.content?.['text/csv'].schema).toEqual({
        type: 'string',
        format: 'binary',
      });

      expect(operation.responses['400']).toBeDefined();
      expect(operation.responses['401']).toBeDefined();
      expect(operation.responses['403']).toBeDefined();
      expect(operation.responses['404']).toBeDefined();
    });
  });
});
