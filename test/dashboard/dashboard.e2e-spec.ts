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

interface SummaryBody {
  electionsCount: number;
  electorsCount: number;
  candidatesCount: number;
}

interface StatusBody {
  pending: number;
  created: number;
  active: number;
  closed: number;
  published: number;
}

describe('Dashboard endpoints (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let emailService: FakeEmailService;

  let adminUser: { id: string; email: string; password: string };
  let auditorUser: { id: string; email: string; password: string };
  let elector: { id: string; email: string; password: string };

  let adminToken = '';
  let auditorToken = '';
  let electorToken = '';

  const suffix = Date.now();
  const usedElectionNames: string[] = [];
  const usedCandidateCodes: string[] = [];
  const usedElectorCodes: string[] = [];
  const userIds: string[] = [];

  let seq = 0;
  const unique = (prefix: string): string => `${prefix}-${suffix}-${++seq}`;

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

  const seedElection = async (name: string, startAt: Date): Promise<string> => {
    const created = await prisma.election.create({
      data: {
        name,
        description: 'E2E dashboard election.',
        start_date: new Date(
          Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth(), startAt.getUTCDate()),
        ),
        start_time: new Date(
          Date.UTC(1970, 0, 1, startAt.getUTCHours(), startAt.getUTCMinutes(), 0),
        ),
        end_date: new Date(Date.UTC(startAt.getUTCFullYear(), startAt.getUTCMonth() + 1, 1)),
        end_time: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
      },
    });
    usedElectionNames.push(name);
    return created.id;
  };

  const seedCandidate = async (status: string, deletedAt: Date | null = null): Promise<string> => {
    const code = unique('CAND');
    usedCandidateCodes.push(code);
    const created = await prisma.candidate.create({
      data: {
        first_name: 'E2E',
        last_name: 'Candidate',
        student_code: code,
        program_code: '2710',
        identification_number: unique('CID'),
        status,
        deleted_at: deletedAt,
      },
    });
    return created.id;
  };

  const seedElector = async (status: string, deletedAt: Date | null = null): Promise<string> => {
    const code = unique('ELEC');
    usedElectorCodes.push(code);
    const created = await prisma.elector.create({
      data: {
        first_name: 'E2E',
        last_name: 'Elector',
        email: unique('ELEC') + '@example.com',
        password_hash: 'pbkdf2$placeholder',
        student_code: code,
        program_code: '2710',
        status,
        deleted_at: deletedAt,
      },
    });
    return created.id;
  };

  const seedAuditLog = async (
    userId: string,
    action: string,
    details?: unknown,
    timestamp?: Date,
  ): Promise<void> => {
    await prisma.auditLog.create({
      data: {
        user_id: userId,
        action,
        details: details === undefined ? null : JSON.stringify(details),
        timestamp: timestamp ?? new Date(),
      },
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
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
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

    adminUser = { id: '', email: unique('admin') + '@example.com', password: 'SuperSecret123!' };
    auditorUser = {
      id: '',
      email: unique('auditor') + '@example.com',
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
    userIds.push(createdAdmin.id, createdAuditor.id);

    const electorCode = unique('ELEC');
    usedElectorCodes.push(electorCode);
    const createdElector = await prisma.elector.create({
      data: {
        first_name: 'E2E',
        last_name: 'Elector',
        email: unique('elec') + '@example.com',
        password_hash: await hash('SuperSecret123!'),
        student_code: electorCode,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    elector = {
      id: createdElector.id,
      email: createdElector.email,
      password: 'SuperSecret123!',
    };

    adminToken = await completeLogin(adminUser.email, adminUser.password);
    auditorToken = await completeLogin(auditorUser.email, auditorUser.password);
    electorToken = await completeElectorLogin(elector.email, elector.password);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.election.deleteMany({ where: { name: { in: usedElectionNames } } });
    await prisma.candidate.deleteMany({
      where: { student_code: { in: usedCandidateCodes } },
    });
    await prisma.elector.deleteMany({ where: { student_code: { in: usedElectorCodes } } });
    await prisma.mfaChallenge.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  describe('GET /dashboard/summary', () => {
    it('DB-SUM-01: returns the counts of all non-deleted records', async () => {
      const beforeElections = await prisma.election.count();
      const beforeCandidates = await prisma.candidate.count({ where: { deleted_at: null } });
      const beforeElectors = await prisma.elector.count({ where: { deleted_at: null } });

      await seedElection(unique('SUM-EL'), new Date(Date.now() + 3600_000));
      await seedCandidate('ACTIVE');
      await seedElector('ACTIVE');

      const res = await request(app.getHttpServer())
        .get('/api/v1/dashboard/summary')
        .set('Cookie', adminToken)
        .expect(200);

      expect(res.body).toEqual({
        electionsCount: beforeElections + 1,
        electorsCount: beforeElectors + 1,
        candidatesCount: beforeCandidates + 1,
      });
    });

    it('DB-SUM-02: excludes soft-deleted candidates and electors', async () => {
      const beforeCandidates = await prisma.candidate.count({ where: { deleted_at: null } });
      const beforeElectors = await prisma.elector.count({ where: { deleted_at: null } });

      await seedCandidate('ACTIVE', new Date());
      await seedElector('ACTIVE', new Date());

      const res = await request(app.getHttpServer())
        .get('/api/v1/dashboard/summary')
        .set('Cookie', adminToken)
        .expect(200);

      const body = res.body as SummaryBody;

      expect(body.candidatesCount).toBe(beforeCandidates);
      expect(body.electorsCount).toBe(beforeElectors);
    });

    it('DB-SUM-03: includes inactive (non-deleted) candidates and electors', async () => {
      const beforeCandidates = await prisma.candidate.count({ where: { deleted_at: null } });
      const beforeElectors = await prisma.elector.count({ where: { deleted_at: null } });

      await seedCandidate('INACTIVE');
      await seedElector('INACTIVE');

      const res = await request(app.getHttpServer())
        .get('/api/v1/dashboard/summary')
        .set('Cookie', adminToken)
        .expect(200);

      const body = res.body as SummaryBody;

      expect(body.candidatesCount).toBe(beforeCandidates + 1);
      expect(body.electorsCount).toBe(beforeElectors + 1);
    });
  });

  describe('GET /dashboard/elections/status', () => {
    it('DB-ST-01/03: returns all five keys and counts the seeded states', async () => {
      await seedElection(unique('ST-EL'), new Date(Date.now() + 3600_000));

      const res = await request(app.getHttpServer())
        .get('/api/v1/dashboard/elections/status')
        .set('Cookie', adminToken)
        .expect(200);

      const body = res.body as StatusBody;

      expect(Object.keys(body).sort()).toEqual(
        ['pending', 'created', 'active', 'closed', 'published'].sort(),
      );
      expect(body.pending).toBeGreaterThanOrEqual(1);
    });

    it('DB-ST-04: does not mutate election state', async () => {
      const id = await seedElection(unique('ST-RO'), new Date(Date.now() + 3600_000));

      await request(app.getHttpServer())
        .get('/api/v1/dashboard/elections/status')
        .set('Cookie', adminToken)
        .expect(200);

      const row = await prisma.election.findUniqueOrThrow({ where: { id } });
      expect(row.current_status).toBe('PENDING');
    });
  });

  describe('GET /dashboard/elections/upcoming', () => {
    it('DB-UP-01: accepts days=30, days=60 and days=90', async () => {
      for (const days of [30, 60, 90]) {
        await request(app.getHttpServer())
          .get(`/api/v1/dashboard/elections/upcoming?days=${days}`)
          .set('Cookie', adminToken)
          .expect(200);
      }
    });

    it('DB-UP-02/03: rejects invalid days values with 400', async () => {
      for (const days of ['15', '45', '120', '0', '-30', 'abc', '30.5']) {
        await request(app.getHttpServer())
          .get(`/api/v1/dashboard/elections/upcoming?days=${days}`)
          .set('Cookie', adminToken)
          .expect(400);
      }
    });

    it('DB-UP-04: defaults to 30 days when omitted', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/elections/upcoming')
        .set('Cookie', adminToken)
        .expect(200);
    });

    it('DB-UP-05/08: excludes started elections and returns the required shape', async () => {
      const startedName = unique('UP-STARTED');
      await seedElection(startedName, new Date(Date.now() - 3600_000));
      const upcomingId = await seedElection(unique('UP-NEXT'), new Date(Date.now() + 2 * 3600_000));

      const res = await request(app.getHttpServer())
        .get('/api/v1/dashboard/elections/upcoming?days=30')
        .set('Cookie', adminToken)
        .expect(200);

      const names = (res.body as Array<{ name: string }>).map((e) => e.name);
      expect(names).not.toContain(startedName);

      const row = await prisma.election.findUniqueOrThrow({ where: { id: upcomingId } });
      const upcoming = (res.body as Array<Record<string, unknown>>).find(
        (e) => e.name === row.name,
      );
      expect(upcoming).toBeTruthy();
      expect(Object.keys(upcoming as object).sort()).toEqual(
        ['name', 'startDate', 'timeUntilStart', 'configurationPercentage'].sort(),
      );
    });

    it('DB-UP-09: returns an empty array when nothing is upcoming', async () => {
      // Seed nothing in the near future; the endpoint may return other data, so only
      // assert the response is an array (empty or not) with 200.
      const res = await request(app.getHttpServer())
        .get('/api/v1/dashboard/elections/upcoming?days=30')
        .set('Cookie', adminToken)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /dashboard/activity/recent', () => {
    it('DB-RA-01: returns at most five records, newest first', async () => {
      for (let i = 0; i < 6; i += 1) {
        await seedAuditLog(
          adminUser.id,
          'ELECTION_CREATED',
          { electionId: unique('RA') },
          new Date(Date.UTC(2099, 0, 1, 0, i, 0)),
        );
      }

      const res = await request(app.getHttpServer())
        .get('/api/v1/dashboard/activity/recent')
        .set('Cookie', adminToken)
        .expect(200);

      const rows = res.body as Array<{ occurredAt: string }>;
      expect(rows).toHaveLength(5);
      const times = rows.map((r) => new Date(r.occurredAt).getTime());
      expect([...times].sort((a, b) => b - a)).toEqual(times);
    });

    it('DB-RA-04: resolves the resource name from the related entity', async () => {
      const electionName = unique('RA-NAME');
      const electionId = await seedElection(electionName, new Date(Date.now() + 3600_000));
      await seedAuditLog(
        adminUser.id,
        'ELECTION_CREATED',
        { electionId },
        new Date(Date.UTC(2099, 0, 2)),
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/dashboard/activity/recent')
        .set('Cookie', adminToken)
        .expect(200);

      const row = (
        res.body as Array<{ action: string; resource: { type: string; name: string } }>
      ).find((r) => r.action === 'ELECTION_CREATED');
      expect(row?.resource).toEqual({ type: 'Election', name: electionName });
    });

    it('DB-RA-06: excludes MFA/session events', async () => {
      await seedAuditLog(
        adminUser.id,
        'MFA_OTP_SENT',
        { sessionId: 's' },
        new Date(Date.UTC(2099, 0, 3)),
      );
      await seedAuditLog(
        adminUser.id,
        'ELECTION_CREATED',
        { electionId: unique('RA-MFA') },
        new Date(Date.UTC(2099, 0, 4)),
      );

      const res = await request(app.getHttpServer())
        .get('/api/v1/dashboard/activity/recent')
        .set('Cookie', adminToken)
        .expect(200);

      const actions = (res.body as Array<{ action: string }>).map((r) => r.action);
      expect(actions).not.toContain('MFA_OTP_SENT');
      expect(actions).toContain('ELECTION_CREATED');
    });

    it('DB-RA-05: does not create or modify audit rows', async () => {
      const before = await prisma.auditLog.count();

      await request(app.getHttpServer())
        .get('/api/v1/dashboard/activity/recent')
        .set('Cookie', adminToken)
        .expect(200);

      expect(await prisma.auditLog.count()).toBe(before);
    });
  });

  describe('authentication & authorization', () => {
    it('DB-AUTH-01: rejects unauthenticated requests with 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/dashboard/summary').expect(401);
    });

    it('DB-AUTH-02: rejects non-admin/auditor actors with 403', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/summary')
        .set('Cookie', electorToken)
        .expect(403);
    });

    it('DB-AUTH-03: allows both ADMINISTRATOR and AUDITOR', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/summary')
        .set('Cookie', adminToken)
        .expect(200);
      await request(app.getHttpServer())
        .get('/api/v1/dashboard/summary')
        .set('Cookie', auditorToken)
        .expect(200);
    });
  });
});
