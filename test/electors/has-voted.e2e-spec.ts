import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { envs } from '../../src/config';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { GlobalExceptionFilter } from '../../src/shared/exceptions/filters/global-exception.filter';
import { buildAuthCookie } from '../auth/auth-cookie.utils';
import { nextTestElectionCode } from '../elections/election-code.utils';

describe('POST /electors/:id/has-voted (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const suffix = Date.now();
  const electionIds: string[] = [];
  const electorIds: string[] = [];

  let electionId: string;
  let votedElectorId: string;
  let notVotedElectorId: string;
  let unregisteredElectorId: string;

  let adminCookie = '';
  let auditorCookie = '';
  let electorCookie = '';

  const sign = (payload: Record<string, unknown>) =>
    buildAuthCookie(jwt.sign(payload, envs.jwtSecret, { expiresIn: envs.jwtExpiresIn }));

  const url = (id: string) => `/api/v1/electors/${id}/has-voted`;

  async function seedElector(label: string): Promise<string> {
    const row = await prisma.elector.create({
      data: {
        first_name: 'HasVoted',
        last_name: label,
        email: `has-voted-${suffix}-${label}@correounivalle.edu.co`,
        password_hash: 'pbkdf2$placeholder',
        student_code: `HV-${suffix}-${label}`,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    electorIds.push(row.id);
    return row.id;
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

    const election = await prisma.election.create({
      data: {
        electionCode: await nextTestElectionCode(prisma),
        name: `HAS-VOTED-E2E-${suffix}`,
        description: 'Has-voted e2e election.',
        start_date: new Date(Date.UTC(2026, 9, 1)),
        start_time: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        end_date: new Date(Date.UTC(2026, 11, 31)),
        end_time: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
        current_status: 'CLOSED',
        blank_vote_enabled: false,
      },
    });
    electionId = election.id;
    electionIds.push(election.id);

    votedElectorId = await seedElector('voted');
    notVotedElectorId = await seedElector('not-voted');
    unregisteredElectorId = await seedElector('unregistered');

    await prisma.electoralRoll.create({
      data: { election_id: electionId, elector_id: votedElectorId, has_voted: true },
    });
    await prisma.electoralRoll.create({
      data: { election_id: electionId, elector_id: notVotedElectorId, has_voted: false },
    });

    adminCookie = sign({
      sub: randomUUID(),
      email: 'admin@example.com',
      actorType: 'USER',
      role: 'ADMINISTRATOR',
    });
    auditorCookie = sign({
      sub: randomUUID(),
      email: 'auditor@example.com',
      actorType: 'USER',
      role: 'AUDITOR',
    });
    electorCookie = sign({
      sub: votedElectorId,
      email: 'elector@example.com',
      actorType: 'ELECTOR',
    });
  });

  afterAll(async () => {
    await prisma.electoralRoll.deleteMany({ where: { election_id: { in: electionIds } } });
    await prisma.election.deleteMany({ where: { id: { in: electionIds } } });
    await prisma.elector.deleteMany({ where: { id: { in: electorIds } } });
    await app.close();
  });

  it('HVE-01: returns 200 with hasVoted true and the exact 3-key contract', async () => {
    const res = await request(app.getHttpServer())
      .post(url(votedElectorId))
      .set('Cookie', adminCookie)
      .send({ electionId })
      .expect(200);

    expect(res.body).toEqual({ electionId, electorId: votedElectorId, hasVoted: true });
    expect(Object.keys(res.body as object).sort()).toEqual(['electionId', 'electorId', 'hasVoted']);
  });

  it('HVE-02: returns 200 with hasVoted false when the elector has not voted', async () => {
    const res = await request(app.getHttpServer())
      .post(url(notVotedElectorId))
      .set('Cookie', adminCookie)
      .send({ electionId })
      .expect(200);

    expect(res.body).toEqual({ electionId, electorId: notVotedElectorId, hasVoted: false });
  });

  it.each([
    ['AUDITOR', () => auditorCookie],
    ['ELECTOR', () => electorCookie],
  ])('HVE-03: any authenticated role (%s) gets 200', async (_role, cookie) => {
    await request(app.getHttpServer())
      .post(url(votedElectorId))
      .set('Cookie', cookie())
      .send({ electionId })
      .expect(200);
  });

  it('HVE-04: returns 401 without a token', async () => {
    await request(app.getHttpServer()).post(url(votedElectorId)).send({ electionId }).expect(401);
  });

  it('HVE-05: returns 401 with an invalid token', async () => {
    await request(app.getHttpServer())
      .post(url(votedElectorId))
      .set('Cookie', buildAuthCookie('not-a-jwt'))
      .send({ electionId })
      .expect(401);
  });

  it('HVE-06: returns 400 when the path id is not a UUID', async () => {
    await request(app.getHttpServer())
      .post(url('not-a-uuid'))
      .set('Cookie', adminCookie)
      .send({ electionId })
      .expect(400);
  });

  it.each([
    ['missing', {}],
    ['not a UUID', { electionId: 'not-a-uuid' }],
  ])('HVE-07: returns 400 when electionId is %s', async (_label, body) => {
    await request(app.getHttpServer())
      .post(url(votedElectorId))
      .set('Cookie', adminCookie)
      .send(body)
      .expect(400);
  });

  it('HVE-08: returns 404 ELECTOR_NOT_FOUND for an unknown elector', async () => {
    const res = await request(app.getHttpServer())
      .post(url(randomUUID()))
      .set('Cookie', adminCookie)
      .send({ electionId })
      .expect(404);

    expect(JSON.stringify(res.body)).toContain('ELECTOR_NOT_FOUND');
  });

  it('HVE-09: returns 404 ELECTION_NOT_FOUND for an unknown election', async () => {
    const res = await request(app.getHttpServer())
      .post(url(votedElectorId))
      .set('Cookie', adminCookie)
      .send({ electionId: randomUUID() })
      .expect(404);

    expect(JSON.stringify(res.body)).toContain('ELECTION_NOT_FOUND');
  });

  it('HVE-10: returns 404 ELECTORAL_ROLL_NOT_FOUND when the elector is not in the roll', async () => {
    const res = await request(app.getHttpServer())
      .post(url(unregisteredElectorId))
      .set('Cookie', adminCookie)
      .send({ electionId })
      .expect(404);

    expect(JSON.stringify(res.body)).toContain('ELECTORAL_ROLL_NOT_FOUND');
  });

  it('HVE-11: does not expose candidacy or vote content', async () => {
    const res = await request(app.getHttpServer())
      .post(url(votedElectorId))
      .set('Cookie', adminCookie)
      .send({ electionId })
      .expect(200);

    const raw = JSON.stringify(res.body);
    expect(raw).not.toMatch(/candidacy|idempotency|registeredAt|lastVote/i);
  });

  it('HVE-12: is read-only (roll rows unchanged)', async () => {
    const before = await prisma.electoralRoll.findMany({
      where: { election_id: electionId },
      orderBy: { elector_id: 'asc' },
    });

    await request(app.getHttpServer())
      .post(url(notVotedElectorId))
      .set('Cookie', adminCookie)
      .send({ electionId })
      .expect(200);

    const after = await prisma.electoralRoll.findMany({
      where: { election_id: electionId },
      orderBy: { elector_id: 'asc' },
    });
    expect(after).toEqual(before);
  });
});
