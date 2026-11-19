/* eslint-disable @typescript-eslint/unbound-method */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import * as jwt from 'jsonwebtoken';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { envs } from '../../src/config';
import {
  VOTER_PARTICIPATION_PORT,
  type VoterParticipationPort,
} from '../../src/modules/electors/application/ports/voter-participation.port';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { GlobalExceptionFilter } from '../../src/shared/exceptions/filters/global-exception.filter';
import { buildAuthCookie } from '../auth/auth-cookie.utils';
import { nextTestElectionCode } from '../elections/election-code.utils';

describe('GET /electors/me/elections/:electionId/certificate (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  // Deterministic ledger double: no real Fabric network is needed.
  const participation: jest.Mocked<VoterParticipationPort> = {
    hasConfirmedVote: jest.fn(),
  };

  const suffix = Date.now();
  const electionIds: string[] = [];
  const electorIds: string[] = [];

  const VOTED_AT = new Date('2026-10-01T14:30:00.000Z');

  let electionId: string;
  let otherElectionId: string;
  let votedElectorId: string;
  let noTimestampElectorId: string;
  let unregisteredElectorId: string;

  const sign = (payload: Record<string, unknown>) =>
    buildAuthCookie(jwt.sign(payload, envs.jwtSecret, { expiresIn: envs.jwtExpiresIn }));
  const electorCookie = (id: string) =>
    sign({ sub: id, email: `${id}@example.com`, actorType: 'ELECTOR' });

  const url = (id: string) => `/api/v1/electors/me/elections/${id}/certificate`;
  const get = (id: string, cookie?: string) => {
    const req = request(app.getHttpServer()).get(url(id));
    if (cookie) req.set('Cookie', cookie);
    return req;
  };

  async function seedElection(label: string, status: 'CLOSED' | 'PUBLISHED'): Promise<string> {
    const row = await prisma.election.create({
      data: {
        electionCode: await nextTestElectionCode(prisma),
        name: `CERT-E2E-${label}-${suffix}`,
        description: 'Voting certificate e2e election.',
        start_date: new Date(Date.UTC(2026, 9, 1)),
        start_time: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        end_date: new Date(Date.UTC(2026, 9, 2)),
        end_time: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
        current_status: status,
        blank_vote_enabled: false,
      },
    });
    electionIds.push(row.id);
    return row.id;
  }

  async function seedElector(label: string): Promise<string> {
    const row = await prisma.elector.create({
      data: {
        first_name: 'Ana María',
        last_name: `Pérez ${label}`,
        email: `cert-${suffix}-${label}@correounivalle.edu.co`,
        password_hash: 'pbkdf2$placeholder',
        student_code: `CERT-${suffix}-${label}`,
        program_code: '2710',
        identification: `ID-${suffix}-${label}`,
        status: 'ACTIVE',
      },
    });
    electorIds.push(row.id);
    return row.id;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(VOTER_PARTICIPATION_PORT)
      .useValue(participation)
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

    electionId = await seedElection('main', 'PUBLISHED');
    otherElectionId = await seedElection('other', 'CLOSED');
    votedElectorId = await seedElector('voted');
    noTimestampElectorId = await seedElector('no-ts');
    unregisteredElectorId = await seedElector('unregistered');

    await prisma.electoralRoll.create({
      data: {
        election_id: electionId,
        elector_id: votedElectorId,
        has_voted: true,
        last_vote_registered_at: VOTED_AT,
      },
    });
    await prisma.electoralRoll.create({
      data: { election_id: electionId, elector_id: noTimestampElectorId, has_voted: true },
    });
  });

  beforeEach(() => {
    participation.hasConfirmedVote.mockReset();
    participation.hasConfirmedVote.mockResolvedValue(true);
  });

  afterAll(async () => {
    await prisma.certificate.deleteMany({ where: { election_id: { in: electionIds } } });
    await prisma.electoralRoll.deleteMany({ where: { election_id: { in: electionIds } } });
    await prisma.election.deleteMany({ where: { id: { in: electionIds } } });
    await prisma.elector.deleteMany({ where: { id: { in: electorIds } } });
    await app.close();
  });

  it('VCE-01: returns 200 with exactly the five certificate fields', async () => {
    const res = await get(electionId, electorCookie(votedElectorId)).expect(200);
    const body = res.body as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual([
      'electionName',
      'verificationCode',
      'voterCode',
      'voterName',
      'votingDate',
    ]);
    expect(body).toEqual({
      electionName: `CERT-E2E-main-${suffix}`,
      votingDate: VOTED_AT.toISOString(),
      voterName: 'Ana María Pérez voted',
      voterCode: `CERT-${suffix}-voted`,
      verificationCode: expect.stringMatching(/^[0-9a-f]{32}$/) as unknown,
    });
    expect(participation.hasConfirmedVote).toHaveBeenCalledWith({
      electionId,
      electorId: votedElectorId,
    });
  });

  it('VCE-02: falls back to the scheduled start when last_vote_registered_at is null', async () => {
    const res = await get(electionId, electorCookie(noTimestampElectorId)).expect(200);

    expect((res.body as { votingDate: string }).votingDate).toBe('2026-10-01T08:00:00.000Z');
  });

  it('VCE-03: is idempotent: same verification code and a single certificate row', async () => {
    const first = await get(electionId, electorCookie(votedElectorId)).expect(200);
    const second = await get(electionId, electorCookie(votedElectorId)).expect(200);

    const code = (first.body as { verificationCode: string }).verificationCode;
    expect((second.body as { verificationCode: string }).verificationCode).toBe(code);

    const roll = await prisma.electoralRoll.findUniqueOrThrow({
      where: { election_id_elector_id: { election_id: electionId, elector_id: votedElectorId } },
    });
    expect(await prisma.certificate.count({ where: { electoral_roll_id: roll.id } })).toBe(1);
  });

  it('VCE-04: returns 409 CERTIFICATE_NOT_AVAILABLE when the ledger does not confirm VOTED', async () => {
    participation.hasConfirmedVote.mockResolvedValue(false);
    const before = await prisma.certificate.count({ where: { election_id: electionId } });

    const res = await get(electionId, electorCookie(noTimestampElectorId)).expect(409);

    expect(JSON.stringify(res.body)).toContain('CERTIFICATE_NOT_AVAILABLE');
    expect(await prisma.certificate.count({ where: { election_id: electionId } })).toBe(before);
  });

  it('VCE-05: returns 401 without a cookie and with an invalid token', async () => {
    await get(electionId).expect(401);
    await get(electionId, buildAuthCookie('not-a-jwt')).expect(401);
  });

  it('VCE-06: returns 403 for an administrator (no elector identity)', async () => {
    const admin = sign({
      sub: randomUUID(),
      email: 'admin@example.com',
      actorType: 'USER',
      role: 'ADMINISTRATOR',
    });

    await get(electionId, admin).expect(403);
  });

  it('VCE-07: returns 400 for a non-UUID electionId', async () => {
    await get('not-a-uuid', electorCookie(votedElectorId)).expect(400);
  });

  it('VCE-08: returns 404 ELECTOR_NOT_FOUND for an unknown elector', async () => {
    const res = await get(electionId, electorCookie(randomUUID())).expect(404);
    expect(JSON.stringify(res.body)).toContain('ELECTOR_NOT_FOUND');
  });

  it('VCE-09: returns 404 ELECTION_NOT_FOUND for an unknown election', async () => {
    const res = await get(randomUUID(), electorCookie(votedElectorId)).expect(404);
    expect(JSON.stringify(res.body)).toContain('ELECTION_NOT_FOUND');
  });

  it('VCE-10: returns 404 ELECTORAL_ROLL_NOT_FOUND when the elector is not in the roll', async () => {
    const res = await get(electionId, electorCookie(unregisteredElectorId)).expect(404);
    expect(JSON.stringify(res.body)).toContain('ELECTORAL_ROLL_NOT_FOUND');

    const other = await get(otherElectionId, electorCookie(votedElectorId)).expect(404);
    expect(JSON.stringify(other.body)).toContain('ELECTORAL_ROLL_NOT_FOUND');
    expect(participation.hasConfirmedVote).not.toHaveBeenCalled();
  });

  it('VCE-11: never exposes ballot content or personal data outside the contract', async () => {
    const res = await get(electionId, electorCookie(votedElectorId)).expect(200);
    const raw = JSON.stringify(res.body);

    for (const forbidden of [
      'candidacy',
      'candidacyId',
      'nullifier',
      'signature',
      'voterHash',
      'hasVoted',
      'email',
      'identification',
      `ID-${suffix}-voted`,
      `cert-${suffix}-voted@`,
    ]) {
      expect(raw).not.toContain(forbidden);
    }
  });

  it('VCE-12: does not modify the vote state of the electoral roll', async () => {
    const where = {
      election_id_elector_id: { election_id: electionId, elector_id: votedElectorId },
    };
    const before = await prisma.electoralRoll.findUniqueOrThrow({ where });

    await get(electionId, electorCookie(votedElectorId)).expect(200);

    const after = await prisma.electoralRoll.findUniqueOrThrow({ where });
    expect(after).toEqual(before);
  });
});
