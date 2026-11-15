import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { envs } from '../../src/config';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { GlobalExceptionFilter } from '../../src/shared/exceptions/filters/global-exception.filter';
import { buildAuthCookie } from '../auth/auth-cookie.utils';
import { nextTestElectionCode } from '../elections/election-code.utils';

interface ElectorElectionBody {
  id: string;
  electionCode: string;
  hasVoted: boolean;
  participationDate: string | null;
  statusHistory: Array<{ status: string; timestamp: string }>;
  candidacies: Array<{ candidate: { id: string } }>;
  registeredVoters: number;
}

interface PaginatedElectorBody {
  data: ElectorElectionBody[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

describe('GET /electors/:id/elections (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const suffix = Date.now();
  const electionIds: string[] = [];
  const electorIds: string[] = [];
  const candidateIds: string[] = [];

  let elector: { id: string; email: string };
  let electorCookie = '';

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

    const row = await prisma.elector.create({
      data: {
        first_name: 'Voter',
        last_name: 'E2E',
        email: `voter-e2e-${suffix}@correounivalle.edu.co`,
        password_hash: 'pbkdf2$placeholder',
        student_code: `VOTER-E2E-${suffix}`,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    electorIds.push(row.id);
    elector = { id: row.id, email: row.email };

    const token = jwt.sign(
      { sub: row.id, email: row.email, actorType: 'ELECTOR' },
      envs.jwtSecret,
      { expiresIn: envs.jwtExpiresIn },
    );
    electorCookie = buildAuthCookie(token);
  });

  afterAll(async () => {
    if (electionIds.length > 0) {
      await prisma.electoralRoll.deleteMany({ where: { election_id: { in: electionIds } } });
      await prisma.electionStatusHistory.deleteMany({
        where: { election_id: { in: electionIds } },
      });
      await prisma.candiday.deleteMany({ where: { election_id: { in: electionIds } } });
      await prisma.election.deleteMany({ where: { id: { in: electionIds } } });
    }
    if (candidateIds.length > 0) {
      await prisma.candidate.deleteMany({ where: { id: { in: candidateIds } } });
    }
    if (electorIds.length > 0) {
      await prisma.elector.deleteMany({ where: { id: { in: electorIds } } });
    }
    await app.close();
  });

  async function seedElection(options: {
    name: string;
    status?: 'PENDING' | 'ACTIVE' | 'CLOSED';
    startDate?: Date;
  }): Promise<string> {
    const row = await prisma.election.create({
      data: {
        electionCode: await nextTestElectionCode(prisma),
        name: options.name,
        description: 'Elector e2e election.',
        start_date: options.startDate ?? new Date(Date.UTC(2026, 9, 1)),
        start_time: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        end_date: new Date(Date.UTC(2026, 11, 31)),
        end_time: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
        current_status: options.status ?? 'ACTIVE',
        blank_vote_enabled: false,
      },
    });
    electionIds.push(row.id);
    return row.id;
  }

  async function seedOtherElector(label: string): Promise<string> {
    const row = await prisma.elector.create({
      data: {
        first_name: 'Other',
        last_name: label,
        email: `voter-e2e-${suffix}-${label}@correounivalle.edu.co`,
        password_hash: 'pbkdf2$placeholder',
        student_code: `VOTER-E2E-${suffix}-${label}`,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    electorIds.push(row.id);
    return row.id;
  }

  async function seedCandidate(label: string): Promise<string> {
    const row = await prisma.candidate.create({
      data: {
        first_name: 'Candidate',
        last_name: label,
        student_code: `CAND-${suffix}-${label}`,
        program_code: '2710',
        identification_number: `ID-${suffix}-${label}`,
        status: 'ACTIVE',
      },
    });
    candidateIds.push(row.id);
    return row.id;
  }

  function getElectorElections(id: string, cookie?: string) {
    const req = request(app.getHttpServer()).get(`/api/v1/electors/${id}/elections`);
    if (cookie) req.set('Cookie', cookie);
    return req;
  }

  it('E2E-01: rejects a request without a JWT with 401', async () => {
    await getElectorElections(elector.id).expect(401);
  });

  it('E2E-02: rejects a non-elector principal with 403', async () => {
    const token = jwt.sign(
      { sub: elector.id, email: elector.email, actorType: 'USER' },
      envs.jwtSecret,
      { expiresIn: envs.jwtExpiresIn },
    );

    await getElectorElections(elector.id, buildAuthCookie(token)).expect(403);
  });

  it('E2E-03: an unresolvable elector identity returns 404', async () => {
    const orphanSub = crypto.randomUUID();
    const orphan = jwt.sign(
      { sub: orphanSub, email: 'nobody@example.com', actorType: 'ELECTOR' },
      envs.jwtSecret,
      { expiresIn: envs.jwtExpiresIn },
    );

    await getElectorElections(orphanSub, buildAuthCookie(orphan)).expect(404);
  });

  it('E2E-04: rejects access to another elector id with 403', async () => {
    const otherId = await seedOtherElector('other');

    await getElectorElections(otherId, electorCookie).expect(403);
  });

  it('E2E-05: returns only eligible elections with full detail and participation', async () => {
    const eligible = await seedElection({ name: `MINE-ELIGIBLE-${suffix}`, status: 'ACTIVE' });
    const notEligible = await seedElection({ name: `MINE-OTHER-${suffix}`, status: 'ACTIVE' });
    const otherElectorId = await seedOtherElector('elig');
    const candidateId = await seedCandidate('elig');
    const participationDate = new Date('2026-10-05T14:30:00.000Z');

    await prisma.electoralRoll.create({
      data: {
        election_id: eligible,
        elector_id: elector.id,
        has_voted: true,
        last_vote_registered_at: participationDate,
      },
    });
    await prisma.electoralRoll.create({
      data: { election_id: notEligible, elector_id: otherElectorId, has_voted: true },
    });
    await prisma.candiday.create({
      data: { election_id: eligible, candidate_id: candidateId, position_number: 1 },
    });
    await prisma.electionStatusHistory.create({
      data: {
        election_id: eligible,
        old_status: 'CREATED',
        new_status: 'ACTIVE',
        changed_at: new Date('2026-10-01T10:00:00.000Z'),
      },
    });

    const res = await getElectorElections(elector.id, electorCookie).expect(200);
    const body = res.body as PaginatedElectorBody;

    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(eligible);
    expect(body.data[0].hasVoted).toBe(true);
    expect(body.data[0].participationDate).toBe(participationDate.toISOString());
    expect(body.data[0].statusHistory).toEqual([
      { status: 'ACTIVE', timestamp: '2026-10-01T10:00:00.000Z' },
    ]);
    expect(body.data[0].candidacies).toHaveLength(1);
    expect(body.data[0].registeredVoters).toBe(1);
    expect(JSON.stringify(body)).not.toContain('lastVoteCandidacyId');
    expect(JSON.stringify(body)).not.toContain('last_vote_candidacy_id');
    expect(body.meta).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
  });

  it('E2E-06: applies filters and pagination', async () => {
    const baseline = (
      await getElectorElections(elector.id, electorCookie).query({ page: 1, limit: 1 }).expect(200)
    ).body as PaginatedElectorBody;

    const first = await seedElection({
      name: `MINE-FILTER-A-${suffix}`,
      status: 'ACTIVE',
      startDate: new Date(Date.UTC(2026, 9, 1)),
    });
    const second = await seedElection({
      name: `MINE-FILTER-B-${suffix}`,
      status: 'ACTIVE',
      startDate: new Date(Date.UTC(2026, 9, 2)),
    });
    const closed = await seedElection({
      name: `MINE-FILTER-C-${suffix}`,
      status: 'CLOSED',
      startDate: new Date(Date.UTC(2026, 9, 3)),
    });

    await prisma.electoralRoll.createMany({
      data: [first, second, closed].map((electionId) => ({
        election_id: electionId,
        elector_id: elector.id,
      })),
    });

    const filtered = await getElectorElections(elector.id, electorCookie)
      .query({ status: 'active', startDateFrom: '2026-10-02', startDateTo: '2026-10-02' })
      .expect(200);
    expect((filtered.body as PaginatedElectorBody).data.map((row) => row.id)).toEqual([second]);

    const paged = await getElectorElections(elector.id, electorCookie)
      .query({ page: 2, limit: 1 })
      .expect(200);
    const pagedBody = paged.body as PaginatedElectorBody;
    expect(pagedBody.data).toHaveLength(1);
    expect(pagedBody.meta).toEqual({
      page: 2,
      limit: 1,
      total: baseline.meta.total + 3,
      totalPages: baseline.meta.total + 3,
    });
  });

  it('E2E-07: rejects an inverted date range with 400', async () => {
    const res = await getElectorElections(elector.id, electorCookie)
      .query({ startDateFrom: '2026-12-31', startDateTo: '2026-01-01' })
      .expect(400);

    expect(JSON.stringify(res.body)).toContain('ELECTION_INVALID_DATE_RANGE');
  });
});
