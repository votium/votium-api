import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { envs } from '../../src/config';
import type { ElectionStatus } from '../../src/modules/elections/domain/entities/election.entity';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { GlobalExceptionFilter } from '../../src/shared/exceptions/filters/global-exception.filter';
import { buildAuthCookie } from '../auth/auth-cookie.utils';
import { nextTestElectionCode } from '../elections/election-code.utils';

interface UpcomingElectionBody {
  id: string;
  currentStatus: string;
  participantsCount: number;
  registeredVotersCount: number;
  participationPercentage: number;
  hasVoted: boolean;
  [key: string]: unknown;
}

const URL = '/api/v1/electors/me/elections/upcoming';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('GET /electors/me/elections/upcoming (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const suffix = Date.now();
  const electionIds: string[] = [];
  const electorIds: string[] = [];

  let voterId: string;
  let otherVoterId: string;
  let voterCookie = '';

  // Seeded election ids, by scenario.
  const ids: Record<string, string> = {};

  const sign = (payload: Record<string, unknown>) =>
    buildAuthCookie(jwt.sign(payload, envs.jwtSecret, { expiresIn: envs.jwtExpiresIn }));

  const dateOf = (i: Date) =>
    new Date(Date.UTC(i.getUTCFullYear(), i.getUTCMonth(), i.getUTCDate()));
  const timeOf = (i: Date) =>
    new Date(Date.UTC(1970, 0, 1, i.getUTCHours(), i.getUTCMinutes(), i.getUTCSeconds()));

  async function seedElector(label: string): Promise<string> {
    const row = await prisma.elector.create({
      data: {
        first_name: 'Upcoming',
        last_name: label,
        email: `upcoming-e2e-${suffix}-${label}@correounivalle.edu.co`,
        password_hash: 'pbkdf2$placeholder',
        student_code: `UPC-E2E-${suffix}-${label}`,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    electorIds.push(row.id);
    return row.id;
  }

  async function seedElection(
    key: string,
    status: ElectionStatus,
    startOffsetMs: number,
    endOffsetMs: number,
  ): Promise<string> {
    const base = Date.now();
    const start = new Date(base + startOffsetMs);
    const end = new Date(base + endOffsetMs);
    const row = await prisma.election.create({
      data: {
        electionCode: await nextTestElectionCode(prisma),
        name: `UPC-E2E-${key}-${suffix}`,
        description: 'Upcoming elections e2e election.',
        start_date: dateOf(start),
        start_time: timeOf(start),
        end_date: dateOf(end),
        end_time: timeOf(end),
        current_status: status,
        blank_vote_enabled: false,
      },
    });
    electionIds.push(row.id);
    ids[key] = row.id;
    return row.id;
  }

  async function enroll(electionId: string, electorId: string, hasVoted = false) {
    await prisma.electoralRoll.create({
      data: { election_id: electionId, elector_id: electorId, has_voted: hasVoted },
    });
  }

  async function getUpcoming(cookie = voterCookie): Promise<UpcomingElectionBody[]> {
    const res = await request(app.getHttpServer()).get(URL).set('Cookie', cookie).expect(200);
    return res.body as UpcomingElectionBody[];
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    voterId = await seedElector('voter');
    otherVoterId = await seedElector('other');
    const extraA = await seedElector('extra-a');
    const extraB = await seedElector('extra-b');
    voterCookie = sign({ sub: voterId, email: 'voter@example.com', actorType: 'ELECTOR' });

    // Included: CREATED within 30 days (voter voted none), with 4 registered / 1 voted.
    await enroll(await seedElection('createdSoon', 'CREATED', 2 * DAY, 3 * DAY), voterId);
    await enroll(ids.createdSoon, extraA, true);
    await enroll(ids.createdSoon, extraB);
    await enroll(ids.createdSoon, otherVoterId);
    // Included: ACTIVE started > 30 days ago and still in course; voter already voted.
    await enroll(await seedElection('activeLong', 'ACTIVE', -40 * DAY, DAY), voterId, true);
    // Excluded scenarios (voter is enrolled in all of them).
    await enroll(await seedElection('createdFar', 'CREATED', 31 * DAY, 32 * DAY), voterId);
    await enroll(await seedElection('createdPast', 'CREATED', -HOUR, DAY), voterId);
    await enroll(await seedElection('pending', 'PENDING', 2 * DAY, 3 * DAY), voterId);
    await enroll(await seedElection('activeEnded', 'ACTIVE', -2 * DAY, -HOUR), voterId);
    for (const status of ['CLOSED', 'PUBLISHED', 'CANCELLED'] as const) {
      await enroll(await seedElection(status, status, -DAY, DAY), voterId);
    }
    // Excluded: in the window but the voter is not in the roll.
    await enroll(await seedElection('notEligible', 'ACTIVE', -DAY, DAY), otherVoterId);
  });

  afterAll(async () => {
    await prisma.electoralRoll.deleteMany({ where: { election_id: { in: electionIds } } });
    await prisma.election.deleteMany({ where: { id: { in: electionIds } } });
    await prisma.elector.deleteMany({ where: { id: { in: electorIds } } });
    await app.close();
  });

  it('UPE-01: returns only CREATED-within-30-days and ACTIVE-in-course eligible elections, ordered by start', async () => {
    const body = await getUpcoming();

    expect(Array.isArray(body)).toBe(true);
    expect(body.map((item) => item.id)).toEqual([ids.activeLong, ids.createdSoon]);
  });

  it('UPE-02: returns the exact base + participation contract', async () => {
    const [item] = await getUpcoming();

    expect(Object.keys(item).sort()).toEqual(
      [
        'id',
        'electionCode',
        'name',
        'description',
        'startDate',
        'startTime',
        'endDate',
        'endTime',
        'currentStatus',
        'blankVoteEnabled',
        'createdAt',
        'participantsCount',
        'registeredVotersCount',
        'participationPercentage',
        'hasVoted',
      ].sort(),
    );
  });

  it('UPE-03: computes participation counts and percentage', async () => {
    const body = await getUpcoming();
    const soon = body.find((item) => item.id === ids.createdSoon);
    const active = body.find((item) => item.id === ids.activeLong);

    expect(soon).toMatchObject({
      participantsCount: 1,
      registeredVotersCount: 4,
      participationPercentage: 25,
      hasVoted: false,
    });
    expect(active).toMatchObject({
      participantsCount: 1,
      registeredVotersCount: 1,
      participationPercentage: 100,
      hasVoted: true,
    });
  });

  it('UPE-04: returns 401 without a token and with an invalid token', async () => {
    await request(app.getHttpServer()).get(URL).expect(401);
    await request(app.getHttpServer())
      .get(URL)
      .set('Cookie', buildAuthCookie('not-a-jwt'))
      .expect(401);
  });

  it.each(['ADMINISTRATOR', 'AUDITOR'])('UPE-05: returns 403 for a %s token', async (role) => {
    await request(app.getHttpServer())
      .get(URL)
      .set(
        'Cookie',
        sign({ sub: randomUUID(), email: 'staff@example.com', actorType: 'USER', role }),
      )
      .expect(403);
  });

  it('UPE-06: returns 404 ELECTOR_NOT_FOUND when the JWT subject is not an elector', async () => {
    const res = await request(app.getHttpServer())
      .get(URL)
      .set('Cookie', sign({ sub: randomUUID(), email: 'ghost@example.com', actorType: 'ELECTOR' }))
      .expect(404);

    expect(JSON.stringify(res.body)).toContain('ELECTOR_NOT_FOUND');
  });

  it('UPE-07: identity comes only from the JWT (an electorId query is ignored)', async () => {
    const res = await request(app.getHttpServer())
      .get(`${URL}?electorId=${otherVoterId}`)
      .set('Cookie', voterCookie)
      .expect(200);

    const body = res.body as UpcomingElectionBody[];
    expect(body.map((item) => item.id)).toEqual([ids.activeLong, ids.createdSoon]);
  });

  it('UPE-08: is read-only and never exposes candidacies or vote content', async () => {
    const before = await prisma.electoralRoll.findMany({
      where: { election_id: { in: electionIds } },
      orderBy: [{ election_id: 'asc' }, { elector_id: 'asc' }],
    });

    const body = await getUpcoming();

    const after = await prisma.electoralRoll.findMany({
      where: { election_id: { in: electionIds } },
      orderBy: [{ election_id: 'asc' }, { elector_id: 'asc' }],
    });
    expect(after).toEqual(before);
    expect(JSON.stringify(body)).not.toMatch(/candidac|lastVote|idempotency|statusHistory/i);
  });

  it('UPE-09: returns 0 participants and 0% when nobody has voted yet', async () => {
    const lonely = await seedElector('lonely');
    await enroll(await seedElection('lonelyActive', 'ACTIVE', -DAY, DAY), lonely);

    const [item] = await getUpcoming(
      sign({ sub: lonely, email: 'lonely@example.com', actorType: 'ELECTOR' }),
    );

    expect(item).toMatchObject({
      participantsCount: 0,
      registeredVotersCount: 1,
      participationPercentage: 0,
      hasVoted: false,
    });
  });
});
