import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { envs } from '../../src/config';
import { ElectionLedgerPort } from '../../src/modules/elections/application/ports/election-ledger.port';
import {
  ElectionResultsPort,
  type ElectionTally,
  type ElectionTallyEntry,
} from '../../src/modules/elections/application/ports/election-results.port';
import { PendingMarksPort } from '../../src/modules/elections/application/ports/pending-marks.port';
import { RoleName } from '../../src/modules/iam/domain/value-objects/role-name.vo';
import { UserStatus } from '../../src/modules/iam/domain/value-objects/user-status.vo';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { GlobalExceptionFilter } from '../../src/shared/exceptions/filters/global-exception.filter';
import { buildAuthCookie } from '../auth/auth-cookie.utils';
import { nextTestElectionCode } from './election-code.utils';

type Status = 'PENDING' | 'CREATED' | 'ACTIVE' | 'CLOSED' | 'PUBLISHED' | 'CANCELLED';

// Fabric stand-in: each test sets the tally (or a failure) per election.
class FakeResults extends ElectionResultsPort {
  tallies = new Map<string, ElectionTallyEntry[]>();
  failing = new Set<string>();

  tally(electionId: string): Promise<ElectionTally> {
    if (this.failing.has(electionId)) return Promise.reject(new Error('Fabric unavailable'));
    const results = this.tallies.get(electionId) ?? [];
    return Promise.resolve({
      status: 'PUBLISHED',
      total: results.reduce((total, entry) => total + entry.votes, 0),
      results,
    });
  }
}

const fakeLedger = { publish: () => Promise.resolve() };
const fakeMarks = { flush: () => Promise.resolve(), pending: () => Promise.resolve(0) };

describe('Election results synchronization (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const fakeResults = new FakeResults();

  const suffix = Date.now();
  const electionIds: string[] = [];
  const candidateIds: string[] = [];
  const userIds: string[] = [];
  let adminCookie = '';
  let auditorCookie = '';

  async function seedUser(role: RoleName): Promise<string> {
    const roleRow = await prisma.role.upsert({
      where: { name: role.value },
      update: {},
      create: { name: role.value },
    });
    const user = await prisma.user.create({
      data: {
        first_name: 'Sync',
        last_name: role.value,
        email: `e2e-sync-${role.value.toLowerCase()}-${suffix}@example.com`,
        password_hash: 'pbkdf2$placeholder',
        role_id: roleRow.id,
        status: UserStatus.ACTIVE.value,
      },
    });
    userIds.push(user.id);
    return buildAuthCookie(
      jwt.sign(
        { sub: user.id, email: user.email, actorType: 'USER', role: role.value },
        envs.jwtSecret,
        { expiresIn: envs.jwtExpiresIn },
      ),
    );
  }

  async function seedElection(status: Status): Promise<string> {
    const row = await prisma.election.create({
      data: {
        electionCode: await nextTestElectionCode(prisma),
        name: `E2E-SYNC-${status}-${suffix}-${Math.random()}`,
        description: 'Results synchronization e2e.',
        start_date: new Date(Date.UTC(2026, 9, 1)),
        start_time: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        end_date: new Date(Date.UTC(2026, 9, 1)),
        end_time: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
        current_status: status,
        blank_vote_enabled: false,
      },
    });
    electionIds.push(row.id);
    return row.id;
  }

  async function seedCandidacy(electionId: string, position: number) {
    const candidate = await prisma.candidate.create({
      data: {
        first_name: 'Sync',
        last_name: `Candidate ${position}`,
        student_code: `SYNC-${suffix}-${Math.random()}`,
        program_code: '1234',
        identification_number: `SYNCI-${suffix}-${Math.random()}`,
        status: 'ACTIVE',
      },
    });
    candidateIds.push(candidate.id);
    const candidacy = await prisma.candiday.create({
      data: { election_id: electionId, candidate_id: candidate.id, position_number: position },
    });
    return { id: candidacy.id, candidateId: candidate.id };
  }

  const votesOf = async (electionId: string) =>
    Object.fromEntries(
      (await prisma.result.findMany({ where: { election_id: electionId } })).map((row) => [
        row.candidacy_id,
        row.votes,
      ]),
    );

  // Polls instead of sleeping: the listener runs asynchronously after publish responds.
  async function waitFor(check: () => Promise<boolean>, timeoutMs = 2000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('Condition not met before timeout');
  }

  const synchronize = (electionId: string, cookie?: string) => {
    const req = request(app.getHttpServer()).post(
      `/api/v1/elections/${electionId}/results/synchronize`,
    );
    if (cookie) req.set('Cookie', cookie);
    return req;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ElectionResultsPort)
      .useValue(fakeResults)
      .overrideProvider(ElectionLedgerPort)
      .useValue(fakeLedger)
      .overrideProvider(PendingMarksPort)
      .useValue(fakeMarks)
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

    adminCookie = await seedUser(RoleName.ADMINISTRATOR);
    auditorCookie = await seedUser(RoleName.AUDITOR);
  });

  afterAll(async () => {
    await prisma.result.deleteMany({ where: { election_id: { in: electionIds } } });
    await prisma.electionStatusHistory.deleteMany({ where: { election_id: { in: electionIds } } });
    await prisma.candiday.deleteMany({ where: { election_id: { in: electionIds } } });
    await prisma.election.deleteMany({ where: { id: { in: electionIds } } });
    await prisma.candidate.deleteMany({ where: { id: { in: candidateIds } } });
    await prisma.auditLog.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('RS-01: no cookie returns 401 and AUDITOR returns 403', async () => {
    const electionId = await seedElection('PUBLISHED');

    await synchronize(electionId).expect(401);
    await synchronize(electionId, auditorCookie).expect(403);
  });

  it('RS-02: a non-UUID election id returns 400', async () => {
    await synchronize('not-a-uuid', adminCookie).expect(400);
  });

  it('RS-03: an unknown election returns 404 ELECTION_NOT_FOUND', async () => {
    const res = await synchronize(randomUUID(), adminCookie).expect(404);
    expect(JSON.stringify(res.body)).toContain('ELECTION_NOT_FOUND');
  });

  it('RS-04: a CLOSED election returns 409 ELECTION_NOT_PUBLISHED and writes nothing', async () => {
    const electionId = await seedElection('CLOSED');
    const a = await seedCandidacy(electionId, 1);
    fakeResults.tallies.set(electionId, [{ candidateId: a.candidateId, name: 'A', votes: 3 }]);

    const res = await synchronize(electionId, adminCookie).expect(409);

    expect(JSON.stringify(res.body)).toContain('ELECTION_NOT_PUBLISHED');
    await expect(prisma.result.count({ where: { election_id: electionId } })).resolves.toBe(0);
  });

  it('RS-05/06: PUBLISHED election syncs the exact contract and is idempotent', async () => {
    const electionId = await seedElection('PUBLISHED');
    const a = await seedCandidacy(electionId, 1);
    const b = await seedCandidacy(electionId, 2);
    const c = await seedCandidacy(electionId, 3);
    fakeResults.tallies.set(electionId, [
      { candidateId: a.candidateId, name: 'A', votes: 7 },
      { candidateId: b.candidateId, name: 'B', votes: 5 },
    ]);

    const first = await synchronize(electionId, adminCookie).expect(200);
    expect(first.body).toEqual({
      electionId,
      synchronized: true,
      candidaciesSynchronized: 3,
      totalVotes: 12,
    });
    const expected = { [a.id]: 7, [b.id]: 5, [c.id]: 0 };
    expect(await votesOf(electionId)).toEqual(expected);

    await synchronize(electionId, adminCookie).expect(200);
    expect(await votesOf(electionId)).toEqual(expected);
    await expect(prisma.result.count({ where: { election_id: electionId } })).resolves.toBe(3);
  });

  it('RS-07: an unknown candidateId returns 409 RESULTS_SYNC_INCONSISTENT and changes nothing', async () => {
    const electionId = await seedElection('PUBLISHED');
    const a = await seedCandidacy(electionId, 1);
    await prisma.result.create({ data: { election_id: electionId, candidacy_id: a.id, votes: 2 } });
    fakeResults.tallies.set(electionId, [
      { candidateId: a.candidateId, name: 'A', votes: 9 },
      { candidateId: randomUUID(), name: 'Ghost', votes: 1 },
    ]);

    const res = await synchronize(electionId, adminCookie).expect(409);

    expect(JSON.stringify(res.body)).toContain('RESULTS_SYNC_INCONSISTENT');
    expect(await votesOf(electionId)).toEqual({ [a.id]: 2 });
  });

  it('RS-08: publish emits the event and results are synchronized asynchronously', async () => {
    const electionId = await seedElection('CLOSED');
    const a = await seedCandidacy(electionId, 1);
    fakeResults.tallies.set(electionId, [{ candidateId: a.candidateId, name: 'A', votes: 4 }]);

    await request(app.getHttpServer())
      .post(`/api/v1/elections/${electionId}/publish`)
      .set('Cookie', adminCookie)
      .expect(200);

    await waitFor(async () => (await votesOf(electionId))[a.id] === 4);
    const election = await prisma.election.findUniqueOrThrow({ where: { id: electionId } });
    expect(election.current_status).toBe('PUBLISHED');
  });

  it('RS-09: a failed sync after publish keeps PUBLISHED and the manual retry works', async () => {
    const electionId = await seedElection('CLOSED');
    const a = await seedCandidacy(electionId, 1);
    fakeResults.failing.add(electionId);

    await request(app.getHttpServer())
      .post(`/api/v1/elections/${electionId}/publish`)
      .set('Cookie', adminCookie)
      .expect(200);

    const election = await prisma.election.findUniqueOrThrow({ where: { id: electionId } });
    expect(election.current_status).toBe('PUBLISHED');
    await expect(prisma.result.count({ where: { election_id: electionId } })).resolves.toBe(0);

    fakeResults.failing.delete(electionId);
    fakeResults.tallies.set(electionId, [{ candidateId: a.candidateId, name: 'A', votes: 6 }]);
    await synchronize(electionId, adminCookie).expect(200);
    expect(await votesOf(electionId)).toEqual({ [a.id]: 6 });
  });
});
