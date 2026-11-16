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

type Status = 'PENDING' | 'CREATED' | 'ACTIVE' | 'CLOSED' | 'PUBLISHED' | 'CANCELLED';

function cookieFor(payload: Record<string, unknown>): string {
  return buildAuthCookie(jwt.sign(payload, envs.jwtSecret, { expiresIn: envs.jwtExpiresIn }));
}

describe('GET /electors/:id/scheduled-elections/count (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const suffix = Date.now();
  const electionIds: string[] = [];
  const electorIds: string[] = [];

  const adminCookie = cookieFor({
    sub: randomUUID(),
    email: 'admin@example.com',
    actorType: 'USER',
    role: 'ADMINISTRATOR',
  });
  const auditorCookie = cookieFor({
    sub: randomUUID(),
    email: 'auditor@example.com',
    actorType: 'USER',
    role: 'AUDITOR',
  });

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
  });

  afterAll(async () => {
    await prisma.electoralRoll.deleteMany({ where: { election_id: { in: electionIds } } });
    await prisma.election.deleteMany({ where: { id: { in: electionIds } } });
    await prisma.elector.deleteMany({ where: { id: { in: electorIds } } });
    await app.close();
  });

  async function seedElector(label: string, deleted = false): Promise<string> {
    const row = await prisma.elector.create({
      data: {
        first_name: 'Count',
        last_name: label,
        email: `count-e2e-${suffix}-${label}@correounivalle.edu.co`,
        password_hash: 'pbkdf2$placeholder',
        student_code: `COUNT-${suffix}-${label}`,
        program_code: '2710',
        status: 'ACTIVE',
        ...(deleted ? { deleted_at: new Date() } : {}),
      },
    });
    electorIds.push(row.id);
    return row.id;
  }

  async function seedElection(status: Status): Promise<string> {
    const row = await prisma.election.create({
      data: {
        electionCode: await nextTestElectionCode(prisma),
        name: `COUNT-E2E-${status}-${suffix}-${Math.random()}`,
        description: 'Scheduled elections count e2e.',
        start_date: new Date(Date.UTC(2026, 11, 1)),
        start_time: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        end_date: new Date(Date.UTC(2026, 11, 2)),
        end_time: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
        current_status: status,
        blank_vote_enabled: false,
      },
    });
    electionIds.push(row.id);
    return row.id;
  }

  async function enroll(electorId: string, electionIdsToEnroll: string[]) {
    await prisma.electoralRoll.createMany({
      data: electionIdsToEnroll.map((electionId) => ({
        election_id: electionId,
        elector_id: electorId,
      })),
    });
  }

  const getCount = (electorId: string, cookie?: string) => {
    const req = request(app.getHttpServer()).get(
      `/api/v1/electors/${electorId}/scheduled-elections/count`,
    );
    if (cookie) req.set('Cookie', cookie);
    return req;
  };

  it('SC-E-01/03/04/05: counts only CREATED elections where the elector is in the roll', async () => {
    const electorId = await seedElector('main');
    const otherId = await seedElector('other');
    const createdA = await seedElection('CREATED');
    const createdB = await seedElection('CREATED');
    const others = await Promise.all(
      (['PENDING', 'ACTIVE', 'CLOSED', 'PUBLISHED', 'CANCELLED'] as const).map(seedElection),
    );
    const createdNotEnrolled = await seedElection('CREATED');
    await enroll(electorId, [createdA, createdB, ...others]);
    await enroll(otherId, [createdA, createdNotEnrolled]);

    const res = await getCount(electorId, adminCookie).expect(200);

    expect(res.body).toEqual({ count: 2 });
  });

  it('SC-E-02: an elector without eligible elections gets { count: 0 }', async () => {
    const electorId = await seedElector('empty');

    const res = await getCount(electorId, adminCookie).expect(200);

    expect(res.body).toEqual({ count: 0 });
  });

  it('SC-E-06: ADMINISTRATOR and AUDITOR both get 200', async () => {
    const electorId = await seedElector('roles');
    await enroll(electorId, [await seedElection('CREATED')]);

    for (const cookie of [adminCookie, auditorCookie]) {
      const res = await getCount(electorId, cookie).expect(200);
      expect(res.body).toEqual({ count: 1 });
    }
  });

  it('SC-E-07: missing or invalid token returns 401', async () => {
    const electorId = await seedElector('unauth');

    await getCount(electorId).expect(401);
    await getCount(electorId, 'access_token=not-a-jwt').expect(401);
  });

  it('SC-E-08: ELECTOR or any other role returns 403', async () => {
    const electorId = await seedElector('forbidden');
    const electorCookie = cookieFor({
      sub: electorId,
      email: 'elector@example.com',
      actorType: 'ELECTOR',
    });
    const otherRoleCookie = cookieFor({
      sub: randomUUID(),
      email: 'other@example.com',
      actorType: 'USER',
      role: 'SOME_OTHER',
    });

    await getCount(electorId, electorCookie).expect(403);
    await getCount(electorId, otherRoleCookie).expect(403);
  });

  it('SC-E-09: a non-UUID elector id returns 400', async () => {
    await getCount('not-a-uuid', adminCookie).expect(400);
  });

  it('SC-E-10: unknown or soft-deleted elector returns 404 ELECTOR_NOT_FOUND', async () => {
    const deletedId = await seedElector('deleted', true);
    await enroll(deletedId, [await seedElection('CREATED')]);

    for (const id of [randomUUID(), deletedId]) {
      const res = await getCount(id, adminCookie).expect(404);
      expect(JSON.stringify(res.body)).toContain('ELECTOR_NOT_FOUND');
    }
  });

  it('SC-E-11/12: body has exactly { count } and the call changes nothing', async () => {
    const electorId = await seedElector('readonly');
    const electionId = await seedElection('CREATED');
    await enroll(electorId, [electionId]);
    const rollsBefore = await prisma.electoralRoll.count({ where: { elector_id: electorId } });
    const historyBefore = await prisma.electionStatusHistory.count({
      where: { election_id: electionId },
    });

    const res = await getCount(electorId, auditorCookie).expect(200);

    expect(Object.keys(res.body as object)).toEqual(['count']);
    const election = await prisma.election.findUniqueOrThrow({ where: { id: electionId } });
    expect(election.current_status).toBe('CREATED');
    await expect(prisma.electoralRoll.count({ where: { elector_id: electorId } })).resolves.toBe(
      rollsBefore,
    );
    await expect(
      prisma.electionStatusHistory.count({ where: { election_id: electionId } }),
    ).resolves.toBe(historyBefore);
  });
});
