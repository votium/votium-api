import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { envs } from '../../src/config';
import { VOTER_PARTICIPATION_PORT } from '../../src/modules/electors/application/ports/voter-participation.port';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { GlobalExceptionFilter } from '../../src/shared/exceptions/filters/global-exception.filter';
import { buildAuthCookie } from '../auth/auth-cookie.utils';
import { nextTestElectionCode } from '../elections/election-code.utils';

interface ListBody {
  data: Record<string, unknown>[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

describe('GET /electors/me/certificates (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // The listing must never reach the ledger: this double fails the test if it is used.
  const hasConfirmedVote = jest.fn(() => {
    throw new Error('Fabric must not be queried by the certificate listing');
  });

  const suffix = Date.now();
  const electionIds: string[] = [];
  const electorIds: string[] = [];

  let electorA: string;
  let electorB: string;
  let electorEmpty: string;
  let deletedElector: string;
  const codesA: string[] = []; // newest first
  let codeB = '';

  const sign = (payload: Record<string, unknown>) =>
    buildAuthCookie(jwt.sign(payload, envs.jwtSecret, { expiresIn: envs.jwtExpiresIn }));
  const electorCookie = (id: string) =>
    sign({ sub: id, email: `${id}@example.com`, actorType: 'ELECTOR' });

  const get = (query = '', cookie?: string) => {
    const req = request(app.getHttpServer()).get(`/api/v1/electors/me/certificates${query}`);
    if (cookie) req.set('Cookie', cookie);
    return req;
  };

  async function seedElection(label: string, startDay = 1): Promise<string> {
    const row = await prisma.election.create({
      data: {
        electionCode: await nextTestElectionCode(prisma),
        name: `CERT-LIST-${label}-${suffix}`,
        description: 'Certificate list e2e election.',
        start_date: new Date(Date.UTC(2026, 9, startDay)),
        start_time: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        end_date: new Date(Date.UTC(2026, 9, 5)),
        end_time: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
        current_status: 'PUBLISHED',
        blank_vote_enabled: false,
      },
    });
    electionIds.push(row.id);
    return row.id;
  }

  async function seedElector(label: string, deleted = false): Promise<string> {
    const row = await prisma.elector.create({
      data: {
        first_name: 'Lista',
        last_name: label,
        email: `cert-list-${suffix}-${label}@correounivalle.edu.co`,
        password_hash: 'pbkdf2$placeholder',
        student_code: `CL-${suffix}-${label}`,
        program_code: '2710',
        identification: `ID-${suffix}-${label}`,
        status: 'ACTIVE',
        deleted_at: deleted ? new Date() : null,
      },
    });
    electorIds.push(row.id);
    return row.id;
  }

  async function seedCertificate(
    electorId: string,
    electionId: string,
    createdAt: Date,
    votedAt: Date | null,
  ): Promise<string> {
    const roll = await prisma.electoralRoll.create({
      data: {
        election_id: electionId,
        elector_id: electorId,
        has_voted: true,
        last_vote_registered_at: votedAt,
      },
    });
    const code = randomUUID().replace(/-/g, '');
    await prisma.certificate.create({
      data: {
        electoral_roll_id: roll.id,
        election_id: electionId,
        verification_code: code,
        created_at: createdAt,
      },
    });
    return code;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(VOTER_PARTICIPATION_PORT)
      .useValue({ hasConfirmedVote })
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

    electorA = await seedElector('a');
    electorB = await seedElector('b');
    electorEmpty = await seedElector('empty');
    deletedElector = await seedElector('deleted', true);

    // Elector A: 3 certificates; the second one has no vote timestamp (fallback).
    const e1 = await seedElection('1', 1);
    const e2 = await seedElection('2', 2);
    const e3 = await seedElection('3', 3);
    const c1 = await seedCertificate(
      electorA,
      e1,
      new Date('2026-10-01T09:00:00.000Z'),
      new Date('2026-10-01T08:59:00.000Z'),
    );
    const c2 = await seedCertificate(electorA, e2, new Date('2026-10-02T09:00:00.000Z'), null);
    const c3 = await seedCertificate(
      electorA,
      e3,
      new Date('2026-10-03T09:00:00.000Z'),
      new Date('2026-10-03T08:59:00.000Z'),
    );
    codesA.push(c3, c2, c1);

    // Elector B shares an election with A.
    codeB = await seedCertificate(electorB, e1, new Date('2026-10-04T09:00:00.000Z'), null);
  });

  afterAll(async () => {
    await prisma.certificate.deleteMany({ where: { election_id: { in: electionIds } } });
    await prisma.electoralRoll.deleteMany({ where: { election_id: { in: electionIds } } });
    await prisma.election.deleteMany({ where: { id: { in: electionIds } } });
    await prisma.elector.deleteMany({ where: { id: { in: electorIds } } });
    await app.close();
  });

  it('VCL-01: returns 200 with the exact data + meta contract, newest first', async () => {
    const res = await get('', electorCookie(electorA)).expect(200);
    const body = res.body as ListBody;

    expect(Object.keys(body).sort()).toEqual(['data', 'meta']);
    expect(body.meta).toEqual({ page: 1, limit: 10, total: 3, totalPages: 1 });
    expect(body.data.map((d) => d.verificationCode)).toEqual(codesA);
    for (const item of body.data) {
      expect(Object.keys(item).sort()).toEqual([
        'electionId',
        'electionName',
        'issuedAt',
        'status',
        'verificationCode',
        'votingDate',
      ]);
    }
    expect(body.data[0]).toMatchObject({
      electionName: `CERT-LIST-3-${suffix}`,
      votingDate: '2026-10-03T08:00:00.000Z',
      status: 'AVAILABLE',
      issuedAt: '2026-10-03T09:00:00.000Z',
    });
    expect(body.data[1].votingDate).toBe('2026-10-02T08:00:00.000Z');
  });

  it('VCL-02: returns an empty page for a voter without certificates', async () => {
    const res = await get('', electorCookie(electorEmpty)).expect(200);

    expect(res.body).toEqual({
      data: [],
      meta: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });
  });

  it('VCL-03: honours page and limit and computes totalPages', async () => {
    const page2 = (await get('?page=2&limit=2', electorCookie(electorA)).expect(200))
      .body as ListBody;
    const page5 = (await get('?page=5&limit=2', electorCookie(electorA)).expect(200))
      .body as ListBody;

    expect(page2.meta).toEqual({ page: 2, limit: 2, total: 3, totalPages: 2 });
    expect(page2.data.map((d) => d.verificationCode)).toEqual([codesA[2]]);
    expect(page5.data).toEqual([]);
    expect(page5.meta.total).toBe(3);
  });

  it.each(['page=0', 'page=-1', 'page=abc', 'limit=0', 'limit=-1', 'limit=abc', 'limit=101'])(
    'VCL-04: returns 400 for %s',
    async (query) => {
      await get(`?${query}`, electorCookie(electorA)).expect(400);
    },
  );

  it('VCL-05: returns 401 without a cookie and with an invalid token', async () => {
    await get('').expect(401);
    await get('', buildAuthCookie('not-a-jwt')).expect(401);
  });

  it('VCL-06: returns 403 for an administrator token', async () => {
    const admin = sign({
      sub: randomUUID(),
      email: 'admin@example.com',
      actorType: 'USER',
      role: 'ADMINISTRATOR',
    });

    await get('', admin).expect(403);
  });

  it('VCL-07: returns 404 ELECTOR_NOT_FOUND for an unknown or soft-deleted elector', async () => {
    const unknown = await get('', electorCookie(randomUUID())).expect(404);
    expect(JSON.stringify(unknown.body)).toContain('ELECTOR_NOT_FOUND');

    const deleted = await get('', electorCookie(deletedElector)).expect(404);
    expect(JSON.stringify(deleted.body)).toContain('ELECTOR_NOT_FOUND');
  });

  it('VCL-08: never lists another voter certificates', async () => {
    const a = (await get('', electorCookie(electorA)).expect(200)).body as ListBody;
    const b = (await get('', electorCookie(electorB)).expect(200)).body as ListBody;

    expect(a.data.map((d) => d.verificationCode)).not.toContain(codeB);
    expect(b.data.map((d) => d.verificationCode)).toEqual([codeB]);
  });

  it('VCL-09: is read-only and never queries Fabric', async () => {
    const before = await prisma.certificate.count();

    await get('', electorCookie(electorA)).expect(200);

    expect(await prisma.certificate.count()).toBe(before);
    expect(hasConfirmedVote).not.toHaveBeenCalled();
  });

  it('VCL-10: never exposes ballot content or personal data', async () => {
    const raw = JSON.stringify((await get('', electorCookie(electorA)).expect(200)).body);

    for (const forbidden of [
      'candidacy',
      'nullifier',
      'signature',
      'voterHash',
      'hasVoted',
      'email',
      'identification',
      'voterName',
      'voterCode',
      `ID-${suffix}-a`,
    ]) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it('VCL-11: documents the endpoint in Swagger', async () => {
    const { DocumentBuilder, SwaggerModule } = await import('@nestjs/swagger');
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    const path = Object.keys(document.paths).find((p) => p.endsWith('/electors/me/certificates'));
    const operation = document.paths[path!].get!;

    expect(operation.parameters!.map((p) => ('name' in p ? p.name : ''))).toEqual(
      expect.arrayContaining(['page', 'limit']),
    );
    expect(Object.keys(operation.responses)).toEqual(
      expect.arrayContaining(['200', '400', '401', '403', '404']),
    );
  });
});
