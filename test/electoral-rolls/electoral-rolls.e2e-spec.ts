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

interface BulkRegisterResponse {
  message: string;
  totalRows: number;
  registered: number;
  alreadyRegistered: number;
  notFound: number;
  invalidRows: number;
  errors: Array<{ row: number; reason: string }>;
}

type SeedStatus = 'CREATED' | 'PENDING' | 'PUBLISHED' | 'ACTIVE' | 'CLOSED';

const CSV_HEADER = 'studentCode,programCode';

const toCsv = (...rows: string[]): Buffer =>
  Buffer.from([CSV_HEADER, ...rows].join('\n') + '\n', 'utf-8');

const row = (studentCode: string, programCode: string): string => `${studentCode},${programCode}`;

describe('Electoral roll bulk registration (e2e)', () => {
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
  const usedStudentCodes: string[] = [];
  const usedUserIds: string[] = [];

  const codeA = `ROLL-A-${suffix}`;
  const codeB = `ROLL-B-${suffix}`;
  const codeC = `ROLL-C-${suffix}`;
  const codeD = `ROLL-D-${suffix}`;

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

  const bulkRegister = (
    electionId: string,
    buffer: Buffer,
    token: string,
    filename = 'padron.csv',
  ) =>
    request(app.getHttpServer())
      .post(`/api/v1/electoral-rolls/bulk-register/${electionId}`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, { filename, contentType: 'text/csv' });

  const seedElection = async (status: SeedStatus): Promise<string> => {
    const name = `E2E-ROLL-${status}-${suffix}-${electionCounter++}`;
    const created = await prisma.election.create({
      data: {
        name,
        description: 'E2E electoral roll election.',
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
        first_name: 'Roll',
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
      email: `e2e-roll-admin-${suffix}@example.com`,
      password: 'SuperSecret123!',
    };
    auditorUser = {
      id: '',
      email: `e2e-roll-auditor-${suffix}@example.com`,
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

    await seedElector(codeA, '2710');
    await seedElector(codeB, '2710');
    await seedElector(codeC, '2711');
    await seedElector(codeD, '2710', 'INACTIVE');

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
      await prisma.election.deleteMany({ where: { id: { in: usedElectionIds } } });
    }
    if (usedUserIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { user_id: { in: usedUserIds } } });
      await prisma.mfaChallenge.deleteMany({ where: { user_id: { in: usedUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: usedUserIds } } });
    }
    if (usedStudentCodes.length > 0) {
      await prisma.elector.deleteMany({ where: { student_code: { in: usedStudentCodes } } });
    }
    await app.close();
  });

  describe('Authorization', () => {
    it('EA1: an authenticated administrator uploads and processes a CSV', async () => {
      const electionId = await seedElection('CREATED');

      const res = await bulkRegister(
        electionId,
        toCsv(row(codeA, '2710'), row(codeB, '2710'), row(codeC, '2711')),
        adminToken,
      ).expect(200);

      expect(res.body).toEqual(
        expect.objectContaining<BulkRegisterResponse>({
          totalRows: 3,
          registered: 3,
          alreadyRegistered: 0,
          notFound: 0,
          invalidRows: 0,
          errors: [],
        }),
      );
    });

    it('EA2: an auditor is rejected with 403', async () => {
      const electionId = await seedElection('CREATED');

      const res = await bulkRegister(electionId, toCsv(row(codeA, '2710')), auditorToken).expect(
        403,
      );

      expect(res.body).toMatchObject({ statusCode: 403 });
    });

    it('EA3: an unauthenticated request is rejected with 401', async () => {
      const electionId = await seedElection('CREATED');

      await request(app.getHttpServer())
        .post(`/api/v1/electoral-rolls/bulk-register/${electionId}`)
        .attach('file', toCsv(row(codeA, '2710')), { filename: 'padron.csv' })
        .expect(401);
    });

    it('EA4: an invalid JWT is rejected with 401', async () => {
      const electionId = await seedElection('CREATED');

      await bulkRegister(electionId, toCsv(row(codeA, '2710')), 'not-a-token').expect(401);
    });

    it('EA5: a request without the Authorization header is rejected with 401', async () => {
      const electionId = await seedElection('CREATED');

      const res = await request(app.getHttpServer())
        .post(`/api/v1/electoral-rolls/bulk-register/${electionId}`)
        .set('Authorization', 'Bearer')
        .attach('file', toCsv(row(codeA, '2710')), { filename: 'padron.csv' })
        .expect(401);

      expect(res.body).toMatchObject({ statusCode: 401 });
    });
  });

  describe('File validation', () => {
    it('EF1: a request without a file is rejected with 400', async () => {
      const electionId = await seedElection('CREATED');

      const res = await request(app.getHttpServer())
        .post(`/api/v1/electoral-rolls/bulk-register/${electionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('EF2: a non-CSV file extension is rejected with 400', async () => {
      const electionId = await seedElection('CREATED');

      const res = await bulkRegister(
        electionId,
        toCsv(row(codeA, '2710')),
        adminToken,
        'padron.txt',
      ).expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        message: 'Only CSV files are supported.',
      });
    });

    it('EF3: a malformed CSV is rejected with 400', async () => {
      const electionId = await seedElection('CREATED');

      const res = await bulkRegister(
        electionId,
        Buffer.from('"unclosed,quote', 'utf-8'),
        adminToken,
      ).expect(400);

      expect(res.body).toMatchObject({ statusCode: 400, message: 'Invalid CSV format.' });
    });

    it('EF4: a row with the wrong column count is rejected with 400', async () => {
      const electionId = await seedElection('CREATED');

      const res = await bulkRegister(electionId, toCsv('99999999,2710,extra'), adminToken).expect(
        400,
      );

      expect(res.body).toMatchObject({
        statusCode: 400,
        message: 'Each CSV row must contain exactly two columns.',
      });
    });

    it('EF5: an empty student code is rejected with 400', async () => {
      const electionId = await seedElection('CREATED');

      const res = await bulkRegister(electionId, toCsv(',2710'), adminToken).expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        message: 'CSV contains incomplete rows.',
      });
    });

    it('EF6: an empty program code is rejected with 400', async () => {
      const electionId = await seedElection('CREATED');

      const res = await bulkRegister(electionId, toCsv(`${codeA},`), adminToken).expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        message: 'CSV contains incomplete rows.',
      });
    });

    it('EF7: an invalid program code format is rejected with 400', async () => {
      const electionId = await seedElection('CREATED');

      const res = await bulkRegister(electionId, toCsv(`${codeA},2A70`), adminToken).expect(400);

      expect(res.body).toMatchObject({
        statusCode: 400,
        message: 'Program code must contain exactly four digits.',
      });
    });

    it('EF8: a CSV with a header row is processed normally', async () => {
      const electionId = await seedElection('CREATED');

      const res = await bulkRegister(
        electionId,
        toCsv(row(codeA, '2710'), row(codeB, '2710')),
        adminToken,
      ).expect(200);

      expect(res.body).toEqual(
        expect.objectContaining<BulkRegisterResponse>({
          totalRows: 2,
          registered: 2,
        }),
      );
    });
  });

  describe('Election rules', () => {
    it('EE1: a nonexistent election returns 404', async () => {
      const res = await bulkRegister(
        '00000000-0000-0000-0000-000000000000',
        toCsv(row(codeA, '2710')),
        adminToken,
      ).expect(404);

      expect(res.body).toMatchObject({ statusCode: 404, error: 'ELECTION_NOT_FOUND' });
    });

    it('EE2: a CREATED election accepts the registration', async () => {
      const electionId = await seedElection('CREATED');

      const res = await bulkRegister(electionId, toCsv(row(codeA, '2710')), adminToken).expect(200);

      expect(res.body.registered).toBe(1);
    });

    it('EE3: a PENDING election accepts the registration', async () => {
      const electionId = await seedElection('PENDING');

      const res = await bulkRegister(electionId, toCsv(row(codeA, '2710')), adminToken).expect(200);

      expect(res.body.registered).toBe(1);
    });

    it('EE4: a PUBLISHED election is rejected with 409', async () => {
      const electionId = await seedElection('PUBLISHED');

      const res = await bulkRegister(electionId, toCsv(row(codeA, '2710')), adminToken).expect(409);

      expect(res.body).toMatchObject({
        statusCode: 409,
        error: 'ELECTION_NOT_REGISTERABLE',
      });
    });

    it('EE5: an ACTIVE election is rejected with 409', async () => {
      const electionId = await seedElection('ACTIVE');

      const res = await bulkRegister(electionId, toCsv(row(codeA, '2710')), adminToken).expect(409);

      expect(res.body).toMatchObject({
        statusCode: 409,
        error: 'ELECTION_NOT_REGISTERABLE',
      });
    });

    it('EE6: a CLOSED election is rejected with 409', async () => {
      const electionId = await seedElection('CLOSED');

      const res = await bulkRegister(electionId, toCsv(row(codeA, '2710')), adminToken).expect(409);

      expect(res.body).toMatchObject({
        statusCode: 409,
        error: 'ELECTION_NOT_REGISTERABLE',
      });
    });

    it('EE7: election validation happens before any roll is written', async () => {
      const electionId = await seedElection('PUBLISHED');

      const res = await bulkRegister(
        electionId,
        toCsv(row(codeA, '2710'), row(codeB, '2710')),
        adminToken,
      ).expect(409);

      expect(res.body.statusCode).toBe(409);

      const rolls = await prisma.electoralRoll.count({ where: { election_id: electionId } });
      expect(rolls).toBe(0);
      const history = await historyFor(electionId);
      expect(history).toHaveLength(0);
      const rowInDb = await prisma.election.findUnique({ where: { id: electionId } });
      expect(rowInDb!.current_status).toBe('PUBLISHED');
    });
  });

  describe('Status transitions', () => {
    it('ET1: a CREATED election transitions to PENDING after a successful load', async () => {
      const electionId = await seedElection('CREATED');

      await bulkRegister(electionId, toCsv(row(codeA, '2710')), adminToken).expect(200);

      const rowInDb = await prisma.election.findUnique({ where: { id: electionId } });
      expect(rowInDb!.current_status).toBe('PENDING');

      const history = await historyFor(electionId);
      expect(history).toHaveLength(1);
      expect(history[0].old_status).toBe('CREATED');
      expect(history[0].new_status).toBe('PENDING');
      expect(history[0].user_id).toBe(adminUser.id);
    });

    it('ET2: a PENDING election stays PENDING with no new history row', async () => {
      const electionId = await seedElection('PENDING');

      await bulkRegister(electionId, toCsv(row(codeA, '2710')), adminToken).expect(200);

      const rowInDb = await prisma.election.findUnique({ where: { id: electionId } });
      expect(rowInDb!.current_status).toBe('PENDING');

      const history = await historyFor(electionId);
      expect(history).toHaveLength(0);
    });

    it('ET3: a CREATED election with zero newly registered stays CREATED with no history', async () => {
      const electionId = await seedElection('CREATED');
      await createDirectRoll(electionId, electorIds[codeA]);

      await bulkRegister(electionId, toCsv(row(codeA, '2710')), adminToken).expect(200);

      const rowInDb = await prisma.election.findUnique({ where: { id: electionId } });
      expect(rowInDb!.current_status).toBe('CREATED');

      const history = await historyFor(electionId);
      expect(history).toHaveLength(0);
    });

    it('ET4: a CREATED election with zero matched rows stays CREATED with no history', async () => {
      const electionId = await seedElection('CREATED');

      await bulkRegister(electionId, toCsv(row('GHOST-1', '2710')), adminToken).expect(200);

      const rowInDb = await prisma.election.findUnique({ where: { id: electionId } });
      expect(rowInDb!.current_status).toBe('CREATED');

      const history = await historyFor(electionId);
      expect(history).toHaveLength(0);
    });

    it('ET5: an ELECTION_STATUS_CHANGED audit entry is written on transition', async () => {
      const electionId = await seedElection('CREATED');

      await bulkRegister(electionId, toCsv(row(codeA, '2710')), adminToken).expect(200);

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

    it('ET6: no ELECTION_STATUS_CHANGED audit entry is written without a transition', async () => {
      const electionId = await seedElection('CREATED');

      await bulkRegister(electionId, toCsv(row('GHOST-1', '2710')), adminToken).expect(200);

      const audit = await prisma.auditLog.findMany({
        where: { user_id: adminUser.id, action: 'ELECTION_STATUS_CHANGED' },
      });
      const matching = audit
        .map((entry) => JSON.parse(entry.details ?? '{}') as Record<string, unknown>)
        .filter((details) => details.electionId === electionId);

      expect(matching).toHaveLength(0);
    });

    it('ET7: rejected requests never write history or a transition audit', async () => {
      const publishedId = await seedElection('PUBLISHED');
      const missingId = '00000000-0000-0000-0000-000000000000';

      await bulkRegister(publishedId, toCsv(row(codeA, '2710')), adminToken).expect(409);
      await bulkRegister(missingId, toCsv(row(codeA, '2710')), adminToken).expect(404);

      const history = await prisma.electionStatusHistory.findMany({
        where: { election_id: { in: [publishedId, missingId] } },
      });
      expect(history).toHaveLength(0);

      const audit = await prisma.auditLog.findMany({
        where: { user_id: adminUser.id, action: 'ELECTION_STATUS_CHANGED' },
      });
      const matching = audit
        .map((entry) => JSON.parse(entry.details ?? '{}') as Record<string, unknown>)
        .filter(
          (details) => details.electionId === publishedId || details.electionId === missingId,
        );
      expect(matching).toHaveLength(0);
    });
  });

  describe('Elector matching', () => {
    it('EM1: registers all rows when every elector matches', async () => {
      const electionId = await seedElection('CREATED');

      const res = await bulkRegister(
        electionId,
        toCsv(row(codeA, '2710'), row(codeB, '2710'), row(codeC, '2711')),
        adminToken,
      ).expect(200);

      expect(res.body).toEqual(
        expect.objectContaining<BulkRegisterResponse>({
          totalRows: 3,
          registered: 3,
          notFound: 0,
        }),
      );
    });

    it('EM2: registers the matched rows and reports the unmatched ones', async () => {
      const electionId = await seedElection('CREATED');

      const res = await bulkRegister(
        electionId,
        toCsv(row(codeA, '2710'), row('GHOST-1', '2710')),
        adminToken,
      ).expect(200);

      expect(res.body).toEqual(
        expect.objectContaining<BulkRegisterResponse>({
          totalRows: 2,
          registered: 1,
          notFound: 1,
          errors: expect.arrayContaining([
            { row: 2, reason: 'Elector not found for the provided student code and program code.' },
          ]),
        }),
      );
    });

    it('EM3: reports notFound for every row when nothing matches', async () => {
      const electionId = await seedElection('CREATED');

      const res = await bulkRegister(
        electionId,
        toCsv(row('GHOST-1', '2710'), row('GHOST-2', '2711')),
        adminToken,
      ).expect(200);

      expect(res.body).toEqual(
        expect.objectContaining<BulkRegisterResponse>({
          totalRows: 2,
          registered: 0,
          notFound: 2,
        }),
      );
    });

    it('EM4: a wrong program code prevents the match', async () => {
      const electionId = await seedElection('CREATED');

      const res = await bulkRegister(electionId, toCsv(row(codeA, '2711')), adminToken).expect(200);

      expect(res.body.notFound).toBe(1);
      expect(res.body.registered).toBe(0);
    });

    it('EM5: matching a student code with the wrong program code is not matched', async () => {
      const electionId = await seedElection('CREATED');

      const res = await bulkRegister(electionId, toCsv(row(codeA, '9999')), adminToken).expect(200);

      expect(res.body.notFound).toBe(1);
      expect(res.body.registered).toBe(0);
    });

    it('EM6: an INACTIVE elector is reported as an invalid row', async () => {
      const electionId = await seedElection('CREATED');

      const res = await bulkRegister(electionId, toCsv(row(codeD, '2710')), adminToken).expect(200);

      expect(res.body).toEqual(
        expect.objectContaining<BulkRegisterResponse>({
          totalRows: 1,
          registered: 0,
          invalidRows: 1,
          errors: [{ row: 1, reason: 'Elector is not active.' }],
        }),
      );
    });
  });

  describe('Duplicate prevention', () => {
    it('ED1: an already registered elector is reported instead of duplicated', async () => {
      const electionId = await seedElection('CREATED');
      await createDirectRoll(electionId, electorIds[codeA]);

      const res = await bulkRegister(electionId, toCsv(row(codeA, '2710')), adminToken).expect(200);

      expect(res.body).toEqual(
        expect.objectContaining<BulkRegisterResponse>({
          totalRows: 1,
          registered: 0,
          alreadyRegistered: 1,
        }),
      );
      expect(await prisma.electoralRoll.count({ where: { election_id: electionId } })).toBe(1);
    });

    it('ED2: duplicate CSV rows are registered only once', async () => {
      const electionId = await seedElection('CREATED');

      const res = await bulkRegister(
        electionId,
        toCsv(row(codeA, '2710'), row(codeA, '2710')),
        adminToken,
      ).expect(200);

      expect(res.body).toEqual(
        expect.objectContaining<BulkRegisterResponse>({
          totalRows: 2,
          registered: 1,
          alreadyRegistered: 0,
        }),
      );
      expect(await prisma.electoralRoll.count({ where: { election_id: electionId } })).toBe(1);
    });

    it('ED3: re-importing the same file reports everything as already registered', async () => {
      const electionId = await seedElection('CREATED');
      const csv = toCsv(row(codeA, '2710'), row(codeB, '2710'));

      await bulkRegister(electionId, csv, adminToken).expect(200);
      const res = await bulkRegister(electionId, csv, adminToken).expect(200);

      expect(res.body).toEqual(
        expect.objectContaining<BulkRegisterResponse>({
          totalRows: 2,
          registered: 0,
          alreadyRegistered: 2,
        }),
      );
    });

    it('ED4: no duplicate ElectoralRoll records exist after an idempotent import', async () => {
      const electionId = await seedElection('CREATED');
      const csv = toCsv(row(codeA, '2710'));

      await bulkRegister(electionId, csv, adminToken).expect(200);
      await bulkRegister(electionId, csv, adminToken).expect(200);
      await bulkRegister(electionId, csv, adminToken).expect(200);

      const rolls = await prisma.electoralRoll.findMany({
        where: { election_id: electionId },
      });
      expect(rolls).toHaveLength(1);
      expect(rolls[0].elector_id).toBe(electorIds[codeA]);
    });
  });

  describe('Response accuracy', () => {
    it('ER1: the response contains all required fields with the message', async () => {
      const electionId = await seedElection('CREATED');

      const res = await bulkRegister(electionId, toCsv(row(codeA, '2710')), adminToken).expect(200);

      expect(Object.keys(res.body).sort()).toEqual(
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
      expect(res.body.message).toBe('Electoral roll registration completed.');
    });

    it('ER2: the counts reflect the processed file accurately', async () => {
      const electionId = await seedElection('CREATED');

      const res = await bulkRegister(
        electionId,
        toCsv(row(codeA, '2710'), row('GHOST-1', '2710'), row(codeD, '2710')),
        adminToken,
      ).expect(200);

      const body = res.body as BulkRegisterResponse;
      expect(body.totalRows).toBe(3);
      expect(body.registered).toBe(1);
      expect(body.invalidRows).toBe(1);
      expect(body.notFound).toBe(1);
      expect(body.errors).toHaveLength(2);
    });

    it('ER3: row-level errors carry the correct row numbers and reasons', async () => {
      const electionId = await seedElection('CREATED');

      const res = await bulkRegister(
        electionId,
        toCsv(row('GHOST-1', '2710'), row(codeD, '2710'), row('GHOST-2', '2711')),
        adminToken,
      ).expect(200);

      expect(res.body.errors).toEqual([
        { row: 1, reason: 'Elector not found for the provided student code and program code.' },
        { row: 2, reason: 'Elector is not active.' },
        { row: 3, reason: 'Elector not found for the provided student code and program code.' },
      ]);
    });

    it('ER4: the response does not leak sensitive data', async () => {
      const electionId = await seedElection('CREATED');

      const res = await bulkRegister(electionId, toCsv(row(codeA, '2710')), adminToken).expect(200);

      const serialized = JSON.stringify(res.body).toLowerCase();
      expect(serialized).not.toContain('password');
      expect(serialized).not.toContain('password_hash');
      expect(serialized).not.toContain('email');
    });
  });

  describe('Data integrity', () => {
    it('EI1: the elector table is not modified by the endpoint', async () => {
      const electionId = await seedElection('CREATED');
      const before = await prisma.elector.count();

      await bulkRegister(electionId, toCsv(row(codeA, '2710')), adminToken).expect(200);

      const after = await prisma.elector.count();
      expect(after).toBe(before);
    });

    it('EI2: elector student code and program code are not modified', async () => {
      const electionId = await seedElection('CREATED');

      await bulkRegister(electionId, toCsv(row(codeA, '2710')), adminToken).expect(200);

      const elector = await prisma.elector.findUnique({ where: { id: electorIds[codeA] } });
      expect(elector!.student_code).toBe(codeA);
      expect(elector!.program_code).toBe('2710');
    });

    it('EI3: ElectoralRoll records point to the right election', async () => {
      const electionId = await seedElection('CREATED');

      await bulkRegister(electionId, toCsv(row(codeA, '2710')), adminToken).expect(200);

      const rolls = await prisma.electoralRoll.findMany({
        where: { election_id: electionId },
      });
      expect(rolls).toHaveLength(1);
      const dbElection = await prisma.election.findUnique({ where: { id: electionId } });
      expect(rolls[0].election_id).toBe(dbElection!.id);
    });

    it('EI4: ElectoralRoll records point to the right electors', async () => {
      const electionId = await seedElection('CREATED');

      await bulkRegister(
        electionId,
        toCsv(row(codeA, '2710'), row(codeB, '2710'), row(codeC, '2711')),
        adminToken,
      ).expect(200);

      const rolls = await prisma.electoralRoll.findMany({ where: { election_id: electionId } });
      expect(new Set(rolls.map((r) => r.elector_id))).toEqual(
        new Set([electorIds[codeA], electorIds[codeB], electorIds[codeC]]),
      );
    });

    it('EI5: a BULK_REGISTER_ELECTORAL_ROLL audit entry is written', async () => {
      const electionId = await seedElection('CREATED');

      await bulkRegister(electionId, toCsv(row(codeA, '2710')), adminToken).expect(200);

      const audit = await prisma.auditLog.findMany({
        where: { user_id: adminUser.id, action: 'BULK_REGISTER_ELECTORAL_ROLL' },
      });
      const matching = audit
        .map((entry) => ({ entry, details: JSON.parse(entry.details ?? '{}') }))
        .filter(({ details }) => details.electionId === electionId);

      expect(matching).toHaveLength(1);
      expect(matching[0].details.totalRows).toBe(1);
      expect(matching[0].details.registered).toBe(1);
    });
  });
});
