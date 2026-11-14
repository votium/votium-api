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

const URL = '/api/v1/electors/me/participation';

describe('GET /electors/me/participation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const suffix = Date.now();
  const electionIds: string[] = [];
  const electorIds: string[] = [];

  let voterId: string;
  let otherVoterId: string;
  let voterCookie = '';

  const sign = (payload: Record<string, unknown>) =>
    buildAuthCookie(jwt.sign(payload, envs.jwtSecret, { expiresIn: envs.jwtExpiresIn }));

  const electorCookie = (sub: string) =>
    sign({ sub, email: `${sub}@example.com`, actorType: 'ELECTOR' });

  async function seedElector(label: string): Promise<string> {
    const row = await prisma.elector.create({
      data: {
        first_name: 'Participation',
        last_name: label,
        email: `participation-e2e-${suffix}-${label}@correounivalle.edu.co`,
        password_hash: 'pbkdf2$placeholder',
        student_code: `PART-E2E-${suffix}-${label}`,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    electorIds.push(row.id);
    return row.id;
  }

  async function seedElection(status: ElectionStatus): Promise<string> {
    const row = await prisma.election.create({
      data: {
        electionCode: await nextTestElectionCode(prisma),
        name: `PART-E2E-${status}-${suffix}-${Math.random()}`,
        description: 'Participation e2e election.',
        start_date: new Date(Date.UTC(2026, 9, 1)),
        start_time: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        end_date: new Date(Date.UTC(2026, 11, 31)),
        end_time: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
        current_status: status,
        blank_vote_enabled: false,
      },
    });
    electionIds.push(row.id);
    return row.id;
  }

  async function enroll(electionId: string, electorId: string, hasVoted: boolean) {
    await prisma.electoralRoll.create({
      data: { election_id: electionId, elector_id: electorId, has_voted: hasVoted },
    });
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
    voterCookie = electorCookie(voterId);

    // Counted: 5 ACTIVE elections in the voter's roll, 3 of them already voted.
    for (const hasVoted of [true, true, true, false, false]) {
      await enroll(await seedElection('ACTIVE'), voterId, hasVoted);
    }
    // Not counted: non-ACTIVE statuses (voted) and an ACTIVE election of another voter.
    for (const status of ['PENDING', 'CREATED', 'CLOSED', 'PUBLISHED', 'CANCELLED'] as const) {
      await enroll(await seedElection(status), voterId, true);
    }
    await enroll(await seedElection('ACTIVE'), otherVoterId, true);
  });

  afterAll(async () => {
    await prisma.electoralRoll.deleteMany({ where: { election_id: { in: electionIds } } });
    await prisma.election.deleteMany({ where: { id: { in: electionIds } } });
    await prisma.elector.deleteMany({ where: { id: { in: electorIds } } });
    await app.close();
  });

  it('VPE-01: returns 200 with the exact 3-field contract, counting only ACTIVE roll elections', async () => {
    const res = await request(app.getHttpServer()).get(URL).set('Cookie', voterCookie).expect(200);

    expect(res.body).toEqual({ participatedElections: 3, activeElections: 5, participation: 60 });
  });

  it('VPE-02: returns zeros when the voter has no active elections', async () => {
    const idle = await seedElector('idle');

    const res = await request(app.getHttpServer())
      .get(URL)
      .set('Cookie', electorCookie(idle))
      .expect(200);

    expect(res.body).toEqual({ participatedElections: 0, activeElections: 0, participation: 0 });
  });

  it('VPE-03: rounds the percentage to 2 decimals (1/3 -> 33.33)', async () => {
    const third = await seedElector('third');
    for (const hasVoted of [true, false, false]) {
      await enroll(await seedElection('ACTIVE'), third, hasVoted);
    }

    const res = await request(app.getHttpServer())
      .get(URL)
      .set('Cookie', electorCookie(third))
      .expect(200);

    expect(res.body).toEqual({
      participatedElections: 1,
      activeElections: 3,
      participation: 33.33,
    });
  });

  it('VPE-04: returns 401 without a token and with an invalid token', async () => {
    await request(app.getHttpServer()).get(URL).expect(401);
    await request(app.getHttpServer())
      .get(URL)
      .set('Cookie', buildAuthCookie('not-a-jwt'))
      .expect(401);
  });

  it.each(['ADMINISTRATOR', 'AUDITOR'])('VPE-05: returns 403 for a %s token', async (role) => {
    await request(app.getHttpServer())
      .get(URL)
      .set(
        'Cookie',
        sign({ sub: randomUUID(), email: 'staff@example.com', actorType: 'USER', role }),
      )
      .expect(403);
  });

  it('VPE-06: returns 404 ELECTOR_NOT_FOUND when the JWT subject is not an elector', async () => {
    const res = await request(app.getHttpServer())
      .get(URL)
      .set('Cookie', electorCookie(randomUUID()))
      .expect(404);

    expect(JSON.stringify(res.body)).toContain('ELECTOR_NOT_FOUND');
  });

  it('VPE-07: identity comes only from the JWT (an electorId query is ignored)', async () => {
    const res = await request(app.getHttpServer())
      .get(`${URL}?electorId=${otherVoterId}`)
      .set('Cookie', voterCookie)
      .expect(200);

    expect(res.body).toEqual({ participatedElections: 3, activeElections: 5, participation: 60 });
  });

  it('VPE-08: is read-only (rolls and election statuses unchanged)', async () => {
    const snapshot = () =>
      Promise.all([
        prisma.electoralRoll.findMany({
          where: { election_id: { in: electionIds } },
          orderBy: [{ election_id: 'asc' }, { elector_id: 'asc' }],
        }),
        prisma.election.findMany({
          where: { id: { in: electionIds } },
          select: { id: true, current_status: true },
          orderBy: { id: 'asc' },
        }),
      ]);
    const before = await snapshot();

    await request(app.getHttpServer()).get(URL).set('Cookie', voterCookie).expect(200);

    expect(await snapshot()).toEqual(before);
  });
});
