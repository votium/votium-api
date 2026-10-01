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
import { CloseExpiredElectionsUseCase } from '../../src/modules/elections/application/use-cases/close-expired-elections.use-case';
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

type SeedStatus = 'CREATED' | 'PENDING' | 'PUBLISHED' | 'ACTIVE' | 'CLOSED';

describe('Election finalize & publish (e2e)', () => {
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
  const usedCandidateIds: string[] = [];
  const usedElectorIds: string[] = [];
  const usedUserIds: string[] = [];

  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * 86_400_000);
  const nextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
  const timeAt = (hh: number, mm = 0, ss = 0): Date => new Date(Date.UTC(1970, 0, 1, hh, mm, ss));

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

  const lifecycleRequest = (
    action: 'finalize' | 'publish' | 'start',
    id: string,
    token?: string,
  ) => {
    const req = request(app.getHttpServer()).post(`/api/v1/elections/${id}/${action}`);
    if (token) req.set('Cookie', token);
    return req.send();
  };

  const historyFor = async (electionId: string) =>
    prisma.electionStatusHistory.findMany({
      where: { election_id: electionId },
      orderBy: { changed_at: 'asc' },
    });

  type ElectionSeedOverrides = {
    status?: SeedStatus;
    startDate?: Date;
    startTime?: Date;
    endDate?: Date;
    endTime?: Date;
  };

  // Seeds directly via Prisma (bypassing the API) so dates can be relative to "now".
  // Default seed is PENDING (the only finalizable status) with a wide schedule-active
  // window: yesterday 00:00 -> tomorrow 23:59:59 (UTC).
  async function seedElection(over: ElectionSeedOverrides = {}): Promise<string> {
    const name = `E2E-FIN-${suffix}-${electionCounter++}`;
    const created = await prisma.election.create({
      data: {
        name,
        description: 'E2E finalize/publish election.',
        start_date: over.startDate ?? addDays(today, -1),
        start_time: over.startTime ?? timeAt(0, 0, 0),
        end_date: over.endDate ?? addDays(today, 1),
        end_time: over.endTime ?? timeAt(23, 59, 59),
        current_status: over.status ?? 'PENDING',
        blank_vote_enabled: false,
      },
    });
    usedElectionIds.push(created.id);
    return created.id;
  }

  async function seedElectorAndRoll(electionId: string): Promise<void> {
    const elector = await prisma.elector.create({
      data: {
        first_name: 'E2E',
        last_name: 'Elector',
        email: `e2e-final-elector-${suffix}-${Math.random()}@example.com`,
        password_hash: 'pbkdf2$placeholder',
        student_code: `E2E-FIN-EL-${suffix}-${Math.random()}`,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    usedElectorIds.push(elector.id);
    await prisma.electoralRoll.create({
      data: { election_id: electionId, elector_id: elector.id },
    });
  }

  async function seedCandidateAndCandidacy(electionId: string): Promise<void> {
    const candidate = await prisma.candidate.create({
      data: {
        first_name: 'E2E',
        last_name: 'Candidate',
        student_code: `E2E-FIN-CAND-${suffix}-${Math.random()}`,
        program_code: 'PC',
        identification_number: `E2E-FIN-ID-${suffix}-${Math.random()}`,
        status: 'ACTIVE',
      },
    });
    usedCandidateIds.push(candidate.id);
    await prisma.candiday.create({
      data: { candidate_id: candidate.id, election_id: electionId, position_number: 1 },
    });
  }

  // Un election finalizable: PENDING + padrón + candidatura.
  async function seedFinalizableElection(): Promise<string> {
    const id = await seedElection();
    await seedElectorAndRoll(id);
    await seedCandidateAndCandidacy(id);
    return id;
  }

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
      email: `e2e-final-admin-${suffix}@example.com`,
      password: 'SuperSecret123!',
    };
    auditorUser = {
      id: '',
      email: `e2e-final-auditor-${suffix}@example.com`,
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
      await prisma.candiday.deleteMany({
        where: { election_id: { in: usedElectionIds } },
      });
      await prisma.election.deleteMany({ where: { id: { in: usedElectionIds } } });
    }
    if (usedCandidateIds.length > 0) {
      await prisma.candidate.deleteMany({ where: { id: { in: usedCandidateIds } } });
    }
    if (usedElectorIds.length > 0) {
      await prisma.elector.deleteMany({ where: { id: { in: usedElectorIds } } });
    }
    if (usedUserIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { user_id: { in: usedUserIds } } });
      await prisma.mfaChallenge.deleteMany({ where: { user_id: { in: usedUserIds } } });
      await prisma.electionStatusHistory.deleteMany({
        where: { user_id: { in: usedUserIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: usedUserIds } } });
    }
    await app.close();
  });

  describe('Finalize (PENDING -> CREATED)', () => {
    it('LC-01: a finalizable election is finalized with 200 and the ElectionResponseDto contract', async () => {
      const id = await seedFinalizableElection();

      const res = await lifecycleRequest('finalize', id, adminToken).expect(200);
      const body = res.body as Record<string, unknown>;

      expect(body.id).toBe(id);
      expect(body.currentStatus).toBe('CREATED');
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

    it('LC-02: the row is CREATED and one PENDING->CREATED history row is recorded with the actor', async () => {
      const id = await seedFinalizableElection();

      await lifecycleRequest('finalize', id, adminToken).expect(200);

      const row = await prisma.election.findUnique({ where: { id } });
      expect(row!.current_status).toBe('CREATED');

      const history = await historyFor(id);
      expect(history).toHaveLength(1);
      expect(history[0].old_status).toBe('PENDING');
      expect(history[0].new_status).toBe('CREATED');
      expect(history[0].user_id).toBe(adminUser.id);
    });

    it('LC-03: finalization does not require being inside the schedule window', async () => {
      // Window entirely in the future: still finalizes (it is not activation).
      const id = await seedElection({
        startDate: addDays(nextMonth, 15),
        startTime: timeAt(8, 0, 0),
        endDate: addDays(nextMonth, 30),
        endTime: timeAt(18, 0, 0),
      });
      await seedElectorAndRoll(id);
      await seedCandidateAndCandidacy(id);

      await lifecycleRequest('finalize', id, adminToken).expect(200);

      expect((await prisma.election.findUnique({ where: { id } }))!.current_status).toBe('CREATED');
    });
  });

  describe('Finalize prerequisites', () => {
    it('CF-01: an election without an electoral roll is rejected with 409 and writes no history', async () => {
      const id = await seedElection();
      await seedCandidateAndCandidacy(id);

      const res = await lifecycleRequest('finalize', id, adminToken).expect(409);
      expect(res.body).toMatchObject({
        statusCode: 409,
        error: 'ELECTION_MISSING_ELECTORAL_ROLL',
      });

      expect((await prisma.election.findUnique({ where: { id } }))!.current_status).toBe('PENDING');
      expect(await historyFor(id)).toHaveLength(0);
    });

    it('CF-02: an election without a registered candidacy is rejected with 409 and writes no history', async () => {
      const id = await seedElection();
      await seedElectorAndRoll(id);

      const res = await lifecycleRequest('finalize', id, adminToken).expect(409);
      expect(res.body).toMatchObject({ statusCode: 409, error: 'ELECTION_NO_CANDIDATES' });

      expect((await prisma.election.findUnique({ where: { id } }))!.current_status).toBe('PENDING');
      expect(await historyFor(id)).toHaveLength(0);
    });

    it('CF-03: a repeated finalization is rejected with 409 and stays CREATED', async () => {
      const id = await seedFinalizableElection();

      await lifecycleRequest('finalize', id, adminToken).expect(200);
      const res = await lifecycleRequest('finalize', id, adminToken).expect(409);
      expect(res.body).toMatchObject({
        statusCode: 409,
        error: 'ELECTION_STATUS_TRANSITION_INVALID',
      });

      expect((await prisma.election.findUnique({ where: { id } }))!.current_status).toBe('CREATED');
      // Non-idempotent (D5): no second CREATED->CREATED history row.
      expect(await historyFor(id)).toHaveLength(1);
    });
  });

  describe('Publish (CLOSED -> PUBLISHED)', () => {
    const seedClosedElection = async (): Promise<string> => {
      const id = await seedElection({ status: 'CLOSED' });
      await seedElectorAndRoll(id);
      await seedCandidateAndCandidacy(id);
      return id;
    };

    it('PB-01: a CLOSED election is published with 200 and the ElectionResponseDto contract', async () => {
      const id = await seedClosedElection();

      const res = await lifecycleRequest('publish', id, adminToken).expect(200);
      const body = res.body as Record<string, unknown>;

      expect(body.id).toBe(id);
      expect(body.currentStatus).toBe('PUBLISHED');
    });

    it('PB-02: the row is PUBLISHED and one CLOSED->PUBLISHED history row is recorded with the actor', async () => {
      const id = await seedClosedElection();

      await lifecycleRequest('publish', id, adminToken).expect(200);

      const row = await prisma.election.findUnique({ where: { id } });
      expect(row!.current_status).toBe('PUBLISHED');

      const history = await historyFor(id);
      expect(history).toHaveLength(1);
      expect(history[0].old_status).toBe('CLOSED');
      expect(history[0].new_status).toBe('PUBLISHED');
      expect(history[0].user_id).toBe(adminUser.id);
    });

    it('PB-03: a CREATED election that has not closed yet is rejected with 409', async () => {
      const id = await seedFinalizableElection();
      await lifecycleRequest('finalize', id, adminToken).expect(200);

      const res = await lifecycleRequest('publish', id, adminToken).expect(409);
      expect(res.body).toMatchObject({
        statusCode: 409,
        error: 'ELECTION_STATUS_TRANSITION_INVALID',
      });

      expect((await prisma.election.findUnique({ where: { id } }))!.current_status).toBe('CREATED');
      expect(await historyFor(id)).toHaveLength(1);
    });

    it('PB-04: a repeated publication is rejected with 409 and stays PUBLISHED', async () => {
      const id = await seedClosedElection();

      await lifecycleRequest('publish', id, adminToken).expect(200);
      await lifecycleRequest('publish', id, adminToken).expect(409);

      expect((await prisma.election.findUnique({ where: { id } }))!.current_status).toBe(
        'PUBLISHED',
      );
      expect(await historyFor(id)).toHaveLength(1);
    });
  });

  describe('Full lifecycle walk', () => {
    it('SW-01: PENDING -> CREATED -> ACTIVE -> CLOSED -> PUBLISHED produces four coherent history rows', async () => {
      const id = await seedFinalizableElection();

      await lifecycleRequest('finalize', id, adminToken).expect(200);
      await lifecycleRequest('start', id, adminToken).expect(200);

      // CLOSED is reached only by the automatic closure process.
      const closed = await app
        .get(CloseExpiredElectionsUseCase)
        .execute({ now: addDays(today, 5) });
      expect(closed.failed).toEqual([]);
      expect((await prisma.election.findUnique({ where: { id } }))!.current_status).toBe('CLOSED');

      await lifecycleRequest('publish', id, adminToken).expect(200);

      const row = await prisma.election.findUnique({ where: { id } });
      expect(row!.current_status).toBe('PUBLISHED');

      const history = await historyFor(id);
      expect(history.map((h) => [h.old_status, h.new_status])).toEqual([
        ['PENDING', 'CREATED'],
        ['CREATED', 'ACTIVE'],
        ['ACTIVE', 'CLOSED'],
        ['CLOSED', 'PUBLISHED'],
      ]);
      // The automatic close carries no actor; the three manual moves carry the admin.
      expect(history.map((h) => h.user_id)).toEqual([
        adminUser.id,
        adminUser.id,
        null,
        adminUser.id,
      ]);
    });

    it('SW-02: a PUBLISHED election is terminal — finalize, start and publish are all refused', async () => {
      const id = await seedElection({ status: 'PUBLISHED' });

      for (const action of ['finalize', 'start', 'publish'] as const) {
        const res = await lifecycleRequest(action, id, adminToken).expect(409);
        expect(res.body).toMatchObject({
          statusCode: 409,
          error: 'ELECTION_STATUS_TRANSITION_INVALID',
        });
      }

      expect((await prisma.election.findUnique({ where: { id } }))!.current_status).toBe(
        'PUBLISHED',
      );
      expect(await historyFor(id)).toHaveLength(0);
    });
  });

  describe('Authentication & authorization', () => {
    it('LC-04 / PB-04: finalize and publish require authentication', async () => {
      const id = await seedFinalizableElection();

      await lifecycleRequest('finalize', id).expect(401);
      await lifecycleRequest('publish', id, 'not-a-real-token').expect(401);
    });

    it('LC-05 / PB-05: an auditor is refused with 403 and no state changes', async () => {
      const id = await seedFinalizableElection();

      const res = await lifecycleRequest('finalize', id, auditorToken).expect(403);
      expect(res.body).toMatchObject({ statusCode: 403 });

      expect((await prisma.election.findUnique({ where: { id } }))!.current_status).toBe('PENDING');
      expect(await historyFor(id)).toHaveLength(0);
    });

    it('LC-06: a non-UUID id is rejected with 400', async () => {
      const res = await lifecycleRequest('finalize', 'not-a-uuid', adminToken).expect(400);
      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('LC-07: a nonexistent election returns 404', async () => {
      const res = await lifecycleRequest(
        'finalize',
        '00000000-0000-4000-8000-000000000000',
        adminToken,
      ).expect(404);
      expect(res.body).toMatchObject({ statusCode: 404, error: 'ELECTION_NOT_FOUND' });
    });
  });
});
