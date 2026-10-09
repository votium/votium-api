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

type SeedStatus = 'PENDING' | 'CREATED' | 'ACTIVE' | 'CLOSED' | 'PUBLISHED' | 'CANCELLED';

describe('Election close & cancel (e2e)', () => {
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
    action: 'finalize' | 'publish' | 'start' | 'close' | 'cancel',
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

  // Seeds directly via Prisma (bypassing the API) so status/dates are fully controlled.
  // Default seed is a schedule-active ACTIVE election: yesterday 00:00 -> tomorrow 23:59:59.
  async function seedElection(over: ElectionSeedOverrides = {}): Promise<string> {
    const name = `E2E-CC-${suffix}-${electionCounter++}`;
    const created = await prisma.election.create({
      data: {
        name,
        description: 'E2E close/cancel election.',
        start_date: over.startDate ?? addDays(today, -1),
        start_time: over.startTime ?? timeAt(0, 0, 0),
        end_date: over.endDate ?? addDays(today, 1),
        end_time: over.endTime ?? timeAt(23, 59, 59),
        current_status: over.status ?? 'ACTIVE',
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
        email: `e2e-cc-elector-${suffix}-${Math.random()}@example.com`,
        password_hash: 'pbkdf2$placeholder',
        student_code: `E2E-CC-EL-${suffix}-${Math.random()}`,
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
        student_code: `E2E-CC-CAND-${suffix}-${Math.random()}`,
        program_code: 'PC',
        identification_number: `E2E-CC-ID-${suffix}-${Math.random()}`,
        status: 'ACTIVE',
      },
    });
    usedCandidateIds.push(candidate.id);
    await prisma.candiday.create({
      data: { candidate_id: candidate.id, election_id: electionId, position_number: 1 },
    });
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
      email: `e2e-cc-admin-${suffix}@example.com`,
      password: 'SuperSecret123!',
    };
    auditorUser = {
      id: '',
      email: `e2e-cc-auditor-${suffix}@example.com`,
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
      await prisma.result.deleteMany({ where: { election_id: { in: usedElectionIds } } });
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

  describe('Cancellation (POST /elections/:id/cancel)', () => {
    it('CX-03: cancels any non-terminal state with 200, persists CANCELLED and one history row', async () => {
      const sources: SeedStatus[] = ['PENDING', 'CREATED', 'ACTIVE', 'CLOSED'];

      for (const source of sources) {
        const id = await seedElection({ status: source });

        const res = await lifecycleRequest('cancel', id, adminToken).expect(200);
        expect((res.body as { currentStatus: string }).currentStatus).toBe('CANCELLED');

        const row = await prisma.election.findUnique({ where: { id } });
        expect(row!.current_status).toBe('CANCELLED');

        const history = await historyFor(id);
        expect(history).toHaveLength(1);
        expect(history[0].old_status).toBe(source);
        expect(history[0].new_status).toBe('CANCELLED');
        expect(history[0].user_id).toBe(adminUser.id);
      }
    });

    it('CX-04: refuses to cancel a PUBLISHED election with 409', async () => {
      const id = await seedElection({ status: 'PUBLISHED' });

      const res = await lifecycleRequest('cancel', id, adminToken).expect(409);
      expect(res.body).toMatchObject({
        statusCode: 409,
        error: 'ELECTION_STATUS_TRANSITION_INVALID',
      });

      expect((await prisma.election.findUnique({ where: { id } }))!.current_status).toBe(
        'PUBLISHED',
      );
      expect(await historyFor(id)).toHaveLength(0);
    });

    it('CX-05: repeated cancellation is refused with 409 and writes no duplicate history', async () => {
      const id = await seedElection({ status: 'ACTIVE' });

      await lifecycleRequest('cancel', id, adminToken).expect(200);
      await lifecycleRequest('cancel', id, adminToken).expect(409);

      expect((await prisma.election.findUnique({ where: { id } }))!.current_status).toBe(
        'CANCELLED',
      );
      expect(await historyFor(id)).toHaveLength(1);
    });

    it('CX-06: a nonexistent election returns 404 and a malformed id returns 400', async () => {
      const missing = await lifecycleRequest(
        'cancel',
        '00000000-0000-4000-8000-000000000000',
        adminToken,
      ).expect(404);
      expect(missing.body).toMatchObject({ statusCode: 404, error: 'ELECTION_NOT_FOUND' });

      await lifecycleRequest('cancel', 'not-a-uuid', adminToken).expect(400);
    });

    it('CX-07: cancellation requires authentication and the ADMINISTRATOR role', async () => {
      const id = await seedElection({ status: 'PENDING' });

      await lifecycleRequest('cancel', id).expect(401);
      const res = await lifecycleRequest('cancel', id, auditorToken).expect(403);
      expect(res.body).toMatchObject({ statusCode: 403 });

      expect((await prisma.election.findUnique({ where: { id } }))!.current_status).toBe('PENDING');
      expect(await historyFor(id)).toHaveLength(0);
    });

    describe('terminality after cancellation', () => {
      it('CX-08..CX-12: a cancelled election cannot start, close, publish, finalize, update or be deleted', async () => {
        const id = await seedElection({ status: 'ACTIVE' });
        await seedElectorAndRoll(id);
        await seedCandidateAndCandidacy(id);
        await lifecycleRequest('cancel', id, adminToken).expect(200);

        for (const action of ['start', 'close', 'publish', 'finalize'] as const) {
          const res = await lifecycleRequest(action, id, adminToken).expect(409);
          expect(res.body).toMatchObject({
            statusCode: 409,
            error: 'ELECTION_STATUS_TRANSITION_INVALID',
          });
        }

        const updateRes = await request(app.getHttpServer())
          .patch(`/api/v1/elections/${id}`)
          .set('Cookie', adminToken)
          .send({ description: 'attempted edit' })
          .expect(409);
        expect(updateRes.body).toMatchObject({ statusCode: 409, error: 'ELECTION_NOT_EDITABLE' });

        const deleteRes = await request(app.getHttpServer())
          .delete(`/api/v1/elections/${id}`)
          .set('Cookie', adminToken)
          .expect(409);
        expect(deleteRes.body).toMatchObject({ statusCode: 409, error: 'ELECTION_NOT_DELETABLE' });

        expect((await prisma.election.findUnique({ where: { id } }))!.current_status).toBe(
          'CANCELLED',
        );
      });

      it('CX-13: the detail endpoint exposes the cancelled state and its history', async () => {
        const id = await seedElection({ status: 'CREATED' });
        await lifecycleRequest('cancel', id, adminToken).expect(200);

        const res = await request(app.getHttpServer())
          .get(`/api/v1/elections/${id}`)
          .set('Cookie', adminToken)
          .expect(200);

        expect((res.body as { currentStatus: string }).currentStatus).toBe('CANCELLED');
        const history = (res.body as { statusHistory: Array<{ status: string }> }).statusHistory;
        expect(history.map((h) => h.status)).toContain('CANCELLED');
      });
    });
  });

  describe('Manual close (POST /elections/:id/close)', () => {
    it('CS-01: closes an ACTIVE election past its end instant with 200 and records the actor', async () => {
      const id = await seedElection({
        status: 'ACTIVE',
        startDate: addDays(today, -2),
        endDate: addDays(today, -1),
        endTime: timeAt(18, 0, 0),
      });

      const res = await lifecycleRequest('close', id, adminToken).expect(200);
      expect((res.body as { currentStatus: string }).currentStatus).toBe('CLOSED');

      const history = await historyFor(id);
      expect(history).toHaveLength(1);
      expect(history[0].old_status).toBe('ACTIVE');
      expect(history[0].new_status).toBe('CLOSED');
      expect(history[0].user_id).toBe(adminUser.id);
    });

    it('CS-02: refuses to close an ACTIVE election whose end instant is still in the future (422)', async () => {
      const id = await seedElection({ status: 'ACTIVE', endDate: addDays(today, 10) });

      const res = await lifecycleRequest('close', id, adminToken).expect(422);
      expect(res.body).toMatchObject({ statusCode: 422, error: 'ELECTION_NOT_ENDED' });

      expect((await prisma.election.findUnique({ where: { id } }))!.current_status).toBe('ACTIVE');
      expect(await historyFor(id)).toHaveLength(0);
    });

    it('CS-03: refuses to close a non-ACTIVE election (including CANCELLED) with 409', async () => {
      for (const status of ['PENDING', 'CREATED', 'CLOSED', 'PUBLISHED', 'CANCELLED'] as const) {
        const id = await seedElection({ status });

        const res = await lifecycleRequest('close', id, adminToken).expect(409);
        expect(res.body).toMatchObject({
          statusCode: 409,
          error: 'ELECTION_STATUS_TRANSITION_INVALID',
        });
        expect(await historyFor(id)).toHaveLength(0);
      }
    });

    it('CS-05: automatic closure still closes an expired ACTIVE election (regression)', async () => {
      const id = await seedElection({
        status: 'ACTIVE',
        startDate: addDays(today, -3),
        endDate: addDays(today, -1),
        endTime: timeAt(18, 0, 0),
      });

      const result = await app
        .get(CloseExpiredElectionsUseCase)
        .execute({ now: addDays(today, 5) });
      expect(result.failed).toEqual([]);

      expect((await prisma.election.findUnique({ where: { id } }))!.current_status).toBe('CLOSED');
      const history = await historyFor(id);
      expect(history).toHaveLength(1);
      expect(history[0].user_id).toBeNull(); // system transition has no actor
    });
  });

  describe('Route conformance', () => {
    it('CX-01/CX-02: start and publish remain exposed as POST actions', async () => {
      const startedId = await seedElection({ status: 'CREATED' });
      await seedElectorAndRoll(startedId);
      await seedCandidateAndCandidacy(startedId);

      const startRes = await lifecycleRequest('start', startedId, adminToken).expect(200);
      expect((startRes.body as { currentStatus: string }).currentStatus).toBe('ACTIVE');

      const closedId = await seedElection({ status: 'CLOSED' });
      const publishRes = await lifecycleRequest('publish', closedId, adminToken).expect(200);
      expect((publishRes.body as { currentStatus: string }).currentStatus).toBe('PUBLISHED');
    });
  });
});
