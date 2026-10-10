import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { App } from 'supertest/types';
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

interface ListResponse {
  data: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    studentCode: string;
    programCode: string;
    status: string;
    createdAt: string;
  }>;
  meta: { page: number; limit: number; total: number; totalPages: number };
}

describe('Electoral roll electors listing (e2e)', () => {
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

  const codeA = `LIST-A-${suffix}`;
  const codeB = `LIST-B-${suffix}`;
  const codeC = `LIST-C-${suffix}`;

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
    return extractAuthCookie(verifyRes);
  };

  const completeElectorLogin = async (email: string, password: string): Promise<string> => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/electors/login')
      .send({ email, password })
      .expect(200);
    const sessionId = (loginRes.body as { sessionId: string }).sessionId;
    const code = emailService.last().code;
    const verifyRes = await request(app.getHttpServer())
      .post('/api/v1/auth/electors/mfa/verify')
      .send({ sessionId, code })
      .expect(201);
    return extractAuthCookie(verifyRes);
  };

  const listElectors = (electionId: string, query = '', token?: string) => {
    const req = request(app.getHttpServer()).get(
      `/api/v1/elections/${electionId}/electoral-roll/electors${query}`,
    );
    if (token) req.set('Cookie', token);
    return req;
  };

  const seedElection = async (): Promise<string> => {
    const name = `E2E-LIST-${suffix}-${electionCounter++}`;
    const created = await prisma.election.create({
      data: {
        name,
        description: 'E2E electoral roll listing election.',
        start_date: new Date(Date.UTC(2026, 9, 1)),
        start_time: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        end_date: new Date(Date.UTC(2026, 9, 1)),
        end_time: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
      },
    });
    usedElectionIds.push(created.id);
    return created.id;
  };

  const seedElector = async (code: string, programCode = '2710', status = 'ACTIVE') => {
    const created = await prisma.elector.create({
      data: {
        first_name: `First-${code}`,
        last_name: 'Listing',
        email: `${code.toLowerCase()}-${suffix}@example.com`,
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
      email: `e2e-list-admin-${suffix}@example.com`,
      password: 'SuperSecret123!',
    };
    auditorUser = {
      id: '',
      email: `e2e-list-auditor-${suffix}@example.com`,
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

    const electorEmail = `e2e-list-elector-${suffix}@example.com`;
    const createdElector = await prisma.elector.create({
      data: {
        first_name: 'E2E',
        last_name: 'Elector',
        email: electorEmail,
        password_hash: await hasher.hash('SuperSecret123!'),
        student_code: `LIST-ELECTOR-${suffix}`,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    usedStudentCodes.push(createdElector.student_code);

    await seedElector(codeA);
    await seedElector(codeB, '2811');
    await seedElector(codeC);

    adminToken = await completeLogin(adminUser.email, adminUser.password);
    auditorToken = await completeLogin(auditorUser.email, auditorUser.password);
    electorToken = await completeElectorLogin(electorEmail, 'SuperSecret123!');
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

  describe('Authorization', () => {
    it('LE-19a: an administrator can list electors', async () => {
      const electionId = await seedElection();
      await createDirectRoll(electionId, electorIds[codeA]);

      await listElectors(electionId, '', adminToken).expect(200);
    });

    it('LE-19b: an auditor can list electors', async () => {
      const electionId = await seedElection();
      await createDirectRoll(electionId, electorIds[codeA]);

      await listElectors(electionId, '', auditorToken).expect(200);
    });

    it('LE-19c: an elector token is rejected with 403', async () => {
      const electionId = await seedElection();

      const res = await listElectors(electionId, '', electorToken).expect(403);

      expect(res.body).toMatchObject({ statusCode: 403 });
    });

    it('LE-18: a missing JWT is rejected with 401', async () => {
      const electionId = await seedElection();

      await listElectors(electionId).expect(401);
    });
  });

  describe('Scoping and envelope', () => {
    it('LE-01/LE-02: returns the standard paginated envelope with elector data', async () => {
      const electionId = await seedElection();
      await createDirectRoll(electionId, electorIds[codeA]);

      const res = await listElectors(electionId, '', adminToken).expect(200);
      const body = res.body as ListResponse;

      expect(body.meta).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
      expect(body.data).toHaveLength(1);
      expect(Object.keys(body.data[0]).sort()).toEqual(
        [
          'id',
          'firstName',
          'lastName',
          'email',
          'studentCode',
          'programCode',
          'status',
          'createdAt',
        ].sort(),
      );
      const serialized = JSON.stringify(body).toLowerCase();
      expect(serialized).not.toContain('password');
      expect(serialized).not.toContain('identification');
    });

    it('LE-03/LE-05: only electors associated with the election are returned', async () => {
      const electionA = await seedElection();
      const electionB = await seedElection();
      await createDirectRoll(electionA, electorIds[codeA]);
      await createDirectRoll(electionA, electorIds[codeB]);
      await createDirectRoll(electionB, electorIds[codeC]);

      const resA = await listElectors(electionA, '', adminToken).expect(200);
      const resB = await listElectors(electionB, '', adminToken).expect(200);

      const aCodes = (resA.body as ListResponse).data.map((e) => e.studentCode).sort();
      const bCodes = (resB.body as ListResponse).data.map((e) => e.studentCode);
      expect(aCodes).toEqual([codeA, codeB]);
      expect(bCodes).toEqual([codeC]);
    });

    it('LE-04: an elector in two elections appears only in the requested one', async () => {
      const electionA = await seedElection();
      const electionB = await seedElection();
      await createDirectRoll(electionA, electorIds[codeA]);
      await createDirectRoll(electionB, electorIds[codeA]);

      const resA = await listElectors(electionA, '', adminToken).expect(200);

      const aCodes = (resA.body as ListResponse).data.map((e) => e.studentCode);
      expect(aCodes).toEqual([codeA]);
      expect((resA.body as ListResponse).meta.total).toBe(1);
    });

    it('LE-08: an election with no members returns the empty envelope', async () => {
      const electionId = await seedElection();

      const res = await listElectors(electionId, '', adminToken).expect(200);
      const body = res.body as ListResponse;

      expect(body.data).toEqual([]);
      expect(body.meta).toEqual({ page: 1, limit: 10, total: 0, totalPages: 0 });
    });
  });

  describe('Pagination and filtering', () => {
    it('LE-06: applies page/limit slicing', async () => {
      const electionId = await seedElection();
      await createDirectRoll(electionId, electorIds[codeA]);
      await createDirectRoll(electionId, electorIds[codeB]);
      await createDirectRoll(electionId, electorIds[codeC]);

      const page1 = await listElectors(electionId, '?page=1&limit=2', adminToken).expect(200);
      const page2 = await listElectors(electionId, '?page=2&limit=2', adminToken).expect(200);

      expect((page1.body as ListResponse).meta).toEqual({
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
      });
      expect((page1.body as ListResponse).data).toHaveLength(2);
      expect((page2.body as ListResponse).data).toHaveLength(1);
    });

    it('LE-12: filters by global elector status', async () => {
      const electionId = await seedElection();
      const inactiveCode = `LIST-INA-${suffix}`;
      await seedElector(inactiveCode, '2710', 'INACTIVE');
      await createDirectRoll(electionId, electorIds[codeA]);
      await createDirectRoll(electionId, electorIds[inactiveCode]);

      const res = await listElectors(electionId, '?status=INACTIVE', adminToken).expect(200);
      const body = res.body as ListResponse;

      expect(body.meta.total).toBe(1);
      expect(body.data[0].studentCode).toBe(inactiveCode);
    });

    it('LE-09: filters by partial program code', async () => {
      const electionId = await seedElection();
      await createDirectRoll(electionId, electorIds[codeA]); // 2710
      await createDirectRoll(electionId, electorIds[codeB]); // 2811

      const res = await listElectors(electionId, '?programCode=2811', adminToken).expect(200);
      const body = res.body as ListResponse;

      expect(body.meta.total).toBe(1);
      expect(body.data[0].studentCode).toBe(codeB);
    });

    it('LE-17: rejects invalid pagination/filter values with 400', async () => {
      const electionId = await seedElection();

      await listElectors(electionId, '?page=0', adminToken).expect(400);
      await listElectors(electionId, '?limit=abc', adminToken).expect(400);
      await listElectors(electionId, '?status=BOGUS', adminToken).expect(400);
      await listElectors(electionId, '?pageSize=10', adminToken).expect(400);
    });
  });

  describe('Election resolution and read-only', () => {
    it('LE-15: a nonexistent election returns 404', async () => {
      const res = await listElectors('00000000-0000-4000-8000-000000000000', '', adminToken).expect(
        404,
      );

      expect(res.body).toMatchObject({ statusCode: 404, error: 'ELECTION_NOT_FOUND' });
    });

    it('LE-16: a malformed election identifier returns 400', async () => {
      await listElectors('not-a-uuid', '', adminToken).expect(400);
    });

    it('LE-20: listing never mutates the roll or electors', async () => {
      const electionId = await seedElection();
      await createDirectRoll(electionId, electorIds[codeA]);

      const beforeRolls = await prisma.electoralRoll.count({ where: { election_id: electionId } });
      const beforeElectors = await prisma.elector.count({
        where: { student_code: { in: usedStudentCodes } },
      });

      await listElectors(electionId, '', adminToken).expect(200);

      const afterRolls = await prisma.electoralRoll.count({ where: { election_id: electionId } });
      const afterElectors = await prisma.elector.count({
        where: { student_code: { in: usedStudentCodes } },
      });

      expect(afterRolls).toBe(beforeRolls);
      expect(afterElectors).toBe(beforeElectors);
    });
  });
});
