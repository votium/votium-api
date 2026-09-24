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
import type { ElectionStatus } from '../../src/modules/elections/domain/entities/election.entity';
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

type SeedStatus = ElectionStatus;

describe('Automatic election closure (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let emailService: FakeEmailService;
  let closeExpiredElections: CloseExpiredElectionsUseCase;

  let adminUser: { id: string; email: string; password: string };
  let adminToken = '';

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

  // Seeds directly via Prisma (bypassing the API) so dates/statuses can be set
  // precisely relative to the injected clock.
  async function seedElection(over: ElectionSeedOverrides = {}): Promise<string> {
    const name = `E2E-ACLOSE-${suffix}-${electionCounter++}`;
    const created = await prisma.election.create({
      data: {
        name,
        description: 'E2E automatic closure election.',
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
        email: `e2e-aclose-elector-${suffix}-${Math.random()}@example.com`,
        password_hash: 'pbkdf2$placeholder',
        student_code: `E2E-ACLOSE-EL-${suffix}-${Math.random()}`,
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
        student_code: `E2E-ACLOSE-CAND-${suffix}-${Math.random()}`,
        program_code: 'PC',
        identification_number: `E2E-ACLOSE-ID-${suffix}-${Math.random()}`,
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
    closeExpiredElections = app.get(CloseExpiredElectionsUseCase, { strict: false });

    const hasher = new NodeCryptoPasswordHasherService();
    const adminRole = await prisma.role.upsert({
      where: { name: RoleName.ADMINISTRATOR.value },
      update: {},
      create: { name: RoleName.ADMINISTRATOR.value },
    });

    adminUser = {
      id: '',
      email: `e2e-aclose-admin-${suffix}@example.com`,
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
    adminUser.id = createdAdmin.id;
    usedUserIds.push(adminUser.id);

    adminToken = await completeLogin(adminUser.email, adminUser.password);
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

  describe('Eligibility boundaries', () => {
    it('E2E-1: an ACTIVE election whose end is still in the future stays ACTIVE with no history', async () => {
      const id = await seedElection({
        endDate: addDays(today, 1),
        endTime: timeAt(23, 59, 59),
      });

      const result = await closeExpiredElections.execute({ now });

      expect(result.failed).toEqual([]);
      const row = await prisma.election.findUnique({ where: { id } });
      expect(row!.current_status).toBe('ACTIVE');
      expect(await historyFor(id)).toHaveLength(0);
    });

    it('E2E-2: closes at the exact end instant with one system-actor history row', async () => {
      // End instant == injected now: end_date = today, end_time = now's time-of-day.
      const endInstant = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          now.getUTCHours(),
          now.getUTCMinutes(),
          now.getUTCSeconds(),
        ),
      );
      const id = await seedElection({
        endDate: new Date(
          Date.UTC(endInstant.getUTCFullYear(), endInstant.getUTCMonth(), endInstant.getUTCDate()),
        ),
        endTime: timeAt(
          endInstant.getUTCHours(),
          endInstant.getUTCMinutes(),
          endInstant.getUTCSeconds(),
        ),
      });

      const result = await closeExpiredElections.execute({ now: endInstant });

      expect(result.failed).toEqual([]);
      expect(result.closed).toBeGreaterThanOrEqual(1);
      const row = await prisma.election.findUnique({ where: { id } });
      expect(row!.current_status).toBe('CLOSED');

      const history = await historyFor(id);
      expect(history).toHaveLength(1);
      expect(history[0].old_status).toBe('ACTIVE');
      expect(history[0].new_status).toBe('CLOSED');
      expect(history[0].user_id).toBeNull();
      expect(history[0].changed_at).toBeInstanceOf(Date);
    });

    it('E2E-3: closes an election that ended hours ago (downtime recovery, no exact match needed)', async () => {
      const id = await seedElection({
        endDate: addDays(today, -1),
        endTime: timeAt(10, 0, 0),
      });

      const result = await closeExpiredElections.execute({ now });

      expect(result.failed).toEqual([]);
      expect(result.closed).toBeGreaterThanOrEqual(1);
      const row = await prisma.election.findUnique({ where: { id } });
      expect(row!.current_status).toBe('CLOSED');
      const history = await historyFor(id);
      expect(history).toHaveLength(1);
      expect(history[0].old_status).toBe('ACTIVE');
      expect(history[0].new_status).toBe('CLOSED');
      expect(history[0].user_id).toBeNull();
    });
  });

  describe('Idempotency & non-eligible statuses', () => {
    it('E2E-4: an already-CLOSED election is untouched and receives no duplicate history', async () => {
      const id = await seedElection({
        status: 'CLOSED',
        endDate: addDays(today, -1),
        endTime: timeAt(10, 0, 0),
      });
      // Prior history row (simulating a previous transition).
      await prisma.electionStatusHistory.create({
        data: { election_id: id, user_id: null, old_status: 'ACTIVE', new_status: 'CLOSED' },
      });
      const historyBefore = await historyFor(id);

      const result = await closeExpiredElections.execute({ now });

      expect(result.failed).toEqual([]);
      expect(result.closed).toBe(0);
      const row = await prisma.election.findUnique({ where: { id } });
      expect(row!.current_status).toBe('CLOSED');
      const historyAfter = await historyFor(id);
      expect(historyAfter).toHaveLength(historyBefore.length);
    });

    it('E2E-5: CREATED, PENDING and PUBLISHED elections with a past end date are never touched', async () => {
      const statuses: SeedStatus[] = ['CREATED', 'PENDING', 'PUBLISHED'];
      const ids: string[] = [];
      for (const status of statuses) {
        ids.push(
          await seedElection({
            status,
            endDate: addDays(today, -1),
            endTime: timeAt(10, 0, 0),
          }),
        );
      }

      const result = await closeExpiredElections.execute({ now });

      expect(result.failed).toEqual([]);
      for (const id of ids) {
        const row = await prisma.election.findUnique({ where: { id } });
        expect(row!.current_status).not.toBe('CLOSED');
        expect(await historyFor(id)).toHaveLength(0);
      }
    });

    it('E2E-7: running twice on the same eligible election closes it once and is idempotent', async () => {
      const id = await seedElection({
        endDate: addDays(today, -1),
        endTime: timeAt(10, 0, 0),
      });

      const first = await closeExpiredElections.execute({ now });
      expect(first.failed).toEqual([]);
      const historyAfterFirst = await historyFor(id);
      expect(historyAfterFirst).toHaveLength(1);
      const rowAfterFirst = await prisma.election.findUnique({ where: { id } });
      expect(rowAfterFirst!.current_status).toBe('CLOSED');

      const second = await closeExpiredElections.execute({ now });
      expect(second.failed).toEqual([]);
      expect(second.closed).toBe(0);
      const historyAfterSecond = await historyFor(id);
      expect(historyAfterSecond).toHaveLength(1);
      const rowAfterSecond = await prisma.election.findUnique({ where: { id } });
      expect(rowAfterSecond!.current_status).toBe('CLOSED');
    });
  });

  describe('Mixed batch', () => {
    it('E2E-6: only eligible elections close and result counts match the seed expectation', async () => {
      // before-end (ACTIVE, end tomorrow)
      const beforeEnd = await seedElection({
        endDate: addDays(today, 1),
        endTime: timeAt(23, 59, 59),
      });
      // exact-end (ACTIVE, end == now)
      const endInstant = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate(),
          now.getUTCHours(),
          now.getUTCMinutes(),
          now.getUTCSeconds(),
        ),
      );
      const exactEnd = await seedElection({
        endDate: new Date(
          Date.UTC(endInstant.getUTCFullYear(), endInstant.getUTCMonth(), endInstant.getUTCDate()),
        ),
        endTime: timeAt(
          endInstant.getUTCHours(),
          endInstant.getUTCMinutes(),
          endInstant.getUTCSeconds(),
        ),
      });
      // past-end (ACTIVE, ended yesterday)
      const pastEnd = await seedElection({
        endDate: addDays(today, -1),
        endTime: timeAt(10, 0, 0),
      });
      // already-closed
      const alreadyClosed = await seedElection({
        status: 'CLOSED',
        endDate: addDays(today, -1),
        endTime: timeAt(10, 0, 0),
      });
      // non-eligible status (PENDING, ended yesterday)
      const nonEligible = await seedElection({
        status: 'PENDING',
        endDate: addDays(today, -1),
        endTime: timeAt(10, 0, 0),
      });

      const result = await closeExpiredElections.execute({ now: endInstant });

      expect(result.failed).toEqual([]);
      // Only the two eligible ACTIVE-ended elections close (exact-end + past-end).
      expect(result.closed).toBe(2);
      expect(result.alreadyClosed).toBe(0);

      const rows = await prisma.election.findMany({
        where: { id: { in: [beforeEnd, exactEnd, pastEnd, alreadyClosed, nonEligible] } },
      });
      const statusById = new Map(rows.map((r) => [r.id, r.current_status]));
      expect(statusById.get(beforeEnd)).toBe('ACTIVE');
      expect(statusById.get(exactEnd)).toBe('CLOSED');
      expect(statusById.get(pastEnd)).toBe('CLOSED');
      expect(statusById.get(alreadyClosed)).toBe('CLOSED');
      expect(statusById.get(nonEligible)).toBe('PENDING');

      // Eligible ones have exactly one system history row; non-eligible/untouched have none.
      expect(await historyFor(exactEnd)).toHaveLength(1);
      expect(await historyFor(pastEnd)).toHaveLength(1);
      expect(await historyFor(beforeEnd)).toHaveLength(0);
      expect(await historyFor(nonEligible)).toHaveLength(0);
    });
  });

  describe('Manual start → automatic close lifecycle', () => {
    it('E2E-8: manual start then automatic close produces one coherent two-row history', async () => {
      // Eligible PENDING seed with roll + candidacy, wide schedule window so manual start succeeds.
      const id = await seedElection({
        status: 'PENDING',
        startDate: addDays(today, -1),
        startTime: timeAt(0, 0, 0),
        endDate: addDays(today, 1),
        endTime: timeAt(23, 59, 59),
      });
      await seedElectorAndRoll(id);
      await seedCandidateAndCandidacy(id);

      // Manual start (admin) → PENDING→ACTIVE with actor.
      await request(app.getHttpServer())
        .post(`/api/v1/elections/${id}/start`)
        .set('Cookie', adminToken)
        .expect(200);

      const afterStart = await historyFor(id);
      expect(afterStart).toHaveLength(1);
      expect(afterStart[0].old_status).toBe('PENDING');
      expect(afterStart[0].new_status).toBe('ACTIVE');
      expect(afterStart[0].user_id).toBe(adminUser.id);

      // Automatic close with now past the end instant.
      const futureNow = addDays(today, 2);
      const result = await closeExpiredElections.execute({ now: futureNow });
      expect(result.failed).toEqual([]);

      const row = await prisma.election.findUnique({ where: { id } });
      expect(row!.current_status).toBe('CLOSED');

      const history = await historyFor(id);
      expect(history).toHaveLength(2);
      expect(history[0].old_status).toBe('PENDING');
      expect(history[0].new_status).toBe('ACTIVE');
      expect(history[0].user_id).toBe(adminUser.id);
      expect(history[1].old_status).toBe('ACTIVE');
      expect(history[1].new_status).toBe('CLOSED');
      expect(history[1].user_id).toBeNull();
    });
  });

  describe('Querying contract unchanged', () => {
    it('E2E-9: a closed election appears in GET /elections?status=CLOSED for an admin', async () => {
      const id = await seedElection({
        endDate: addDays(today, -1),
        endTime: timeAt(10, 0, 0),
      });
      await closeExpiredElections.execute({ now });

      const res = await request(app.getHttpServer())
        .get('/api/v1/elections?status=CLOSED')
        .set('Cookie', adminToken)
        .expect(200);
      const body = res.body as { data: Array<{ id: string; currentStatus: string }> };
      const found = body.data.find((e) => e.id === id);
      expect(found).toBeDefined();
      expect(found!.currentStatus).toBe('CLOSED');
    });
  });
});
