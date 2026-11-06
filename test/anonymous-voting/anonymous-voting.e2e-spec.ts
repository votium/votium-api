import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { App } from 'supertest/types';
import { randomUUID } from 'crypto';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { GlobalExceptionFilter } from '../../src/shared/exceptions/filters/global-exception.filter';
import {
  ASYNC_EMAIL_SERVICE_PORT,
  type AsyncEmailServicePort,
} from '../../src/modules/auth/application/ports/async-email-service.port';
import { NodeCryptoPasswordHasherService } from '../../src/modules/iam/infrastructure/services/node-crypto-password-hasher.service';
import {
  SchnorrRistrettoZkp,
  type SchnorrProof,
} from '../../src/modules/anonymous-voting/domain/crypto/schnorr-zkp';
import { extractAuthCookie } from '../auth/auth-cookie.utils';
import { nextTestElectionCode } from '../elections/election-code.utils';
import { blindForElection, publicCommitmentHex, randomSecretHex } from './client-crypto';

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

// Election window in days relative to today (UTC). Election dates are stored as date + time.
function windowDays(fromDay: number, toDay: number) {
  const today = new Date();
  const midnight = (offset: number) =>
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + offset));
  return {
    start_date: midnight(fromDay),
    end_date: midnight(toDay),
    start_time: new Date('1970-01-01T00:00:00.000Z'),
    end_time: new Date('1970-01-01T23:59:59.000Z'),
  };
}

describe('Anonymous voting (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let emailService: FakeEmailService;
  const suffix = Date.now();
  const password = 'SuperSecret123!';
  const zkp = new SchnorrRistrettoZkp();

  const electionIds: string[] = [];
  const electorIds: string[] = [];
  const candidateIds: string[] = [];

  let activeElectionId = '';
  let blankDisabledElectionId = '';
  let futureElectionId = '';
  let candidacyId = '';
  let inRoll: { id: string; email: string };
  let secondInRoll: { id: string; email: string };

  async function seedElection(
    options: { window?: ReturnType<typeof windowDays>; blank?: boolean } = {},
  ): Promise<string> {
    const row = await prisma.election.create({
      data: {
        electionCode: await nextTestElectionCode(prisma),
        name: `E2E-ANON-${suffix}-${Math.random()}`,
        description: 'anonymous voting e2e',
        ...(options.window ?? windowDays(-1, 1)),
        current_status: 'ACTIVE',
        blank_vote_enabled: options.blank ?? true,
      },
    });
    electionIds.push(row.id);
    return row.id;
  }

  async function seedElector(tag: string): Promise<{ id: string; email: string }> {
    const hasher = new NodeCryptoPasswordHasherService();
    const email = `e2e-anon-${tag}-${suffix}@correounivalle.edu.co`;
    const e = await prisma.elector.create({
      data: {
        first_name: 'Anon',
        last_name: tag,
        email,
        password_hash: await hasher.hash(password),
        student_code: `E2EANON-${tag}-${suffix}`,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    electorIds.push(e.id);
    return { id: e.id, email };
  }

  async function login(email: string): Promise<string> {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/electors/login')
      .send({ email, password })
      .expect(200);
    const sessionId = (loginRes.body as { sessionId: string }).sessionId;
    const code = emailService.last().code;
    const verify = await request(app.getHttpServer())
      .post('/api/v1/auth/electors/mfa/verify')
      .send({ sessionId, code })
      .expect(201);
    return extractAuthCookie(verify);
  }

  const publicKeyPem = async (electionId: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/elections/${electionId}/anonymous-voting/public-key`)
      .expect(200);
    return (res.body as { publicKeyPem: string }).publicKeyPem;
  };

  const issue = (electionId: string, cookie: string | undefined, body: object) => {
    const req = request(app.getHttpServer()).post(
      `/api/v1/elections/${electionId}/anonymous-voting/credentials`,
    );
    if (cookie) req.set('Cookie', cookie);
    return req.send(body);
  };

  const castVote = (electionId: string, body: object) =>
    request(app.getHttpServer()).post(`/api/v1/elections/${electionId}/anonymous-votes`).send(body);

  // Full client path for one credential: blind, request signature, unblind, prove.
  async function obtainVote(
    electionId: string,
    cookie: string,
    candidacy: string,
    secret = randomSecretHex(),
  ) {
    const ballotId = randomUUID();
    const pem = await publicKeyPem(electionId);
    const blind = await blindForElection(pem, electionId, ballotId);
    const y = await publicCommitmentHex(secret);
    const issued = await issue(electionId, cookie, {
      y,
      blindedMessageHex: blind.blindedMessageHex,
    }).expect(201);
    const signature = await blind.unblind(
      (issued.body as { blindSignatureHex: string }).blindSignatureHex,
    );
    const proof: SchnorrProof = await zkp.prove(secret, {
      electionId,
      ballotId,
      candidacyId: candidacy,
    });
    return { ballotId, signature, proof, secret };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ASYNC_EMAIL_SERVICE_PORT)
      .useValue(new FakeEmailService())
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
    emailService = app.get<FakeEmailService>(ASYNC_EMAIL_SERVICE_PORT);

    activeElectionId = await seedElection();
    blankDisabledElectionId = await seedElection({ blank: false });
    futureElectionId = await seedElection({ window: windowDays(2, 3) });
    // Future-window election: status is still ACTIVE, so only the schedule check can reject it.

    const candidate = await prisma.candidate.create({
      data: {
        first_name: 'E2E',
        last_name: 'Candidate',
        student_code: `E2EANC-${suffix}`,
        program_code: '1234',
        identification_number: `E2EANI-${suffix}`,
        status: 'ACTIVE',
      },
    });
    candidateIds.push(candidate.id);
    const candidacy = await prisma.candiday.create({
      data: { election_id: activeElectionId, candidate_id: candidate.id, position_number: 1 },
    });
    candidacyId = candidacy.id;
    await prisma.candiday.create({
      data: {
        election_id: blankDisabledElectionId,
        candidate_id: candidate.id,
        position_number: 1,
      },
    });
    await prisma.candiday.create({
      data: { election_id: futureElectionId, candidate_id: candidate.id, position_number: 1 },
    });

    inRoll = await seedElector('a');
    secondInRoll = await seedElector('b');
    for (const electionId of [activeElectionId, blankDisabledElectionId, futureElectionId]) {
      for (const elector of [inRoll, secondInRoll]) {
        await prisma.electoralRoll.create({
          data: { election_id: electionId, elector_id: elector.id },
        });
      }
    }
  });

  afterAll(async () => {
    await prisma.anonymousVote.deleteMany({ where: { election_id: { in: electionIds } } });
    await prisma.anonymousCredential.deleteMany({ where: { election_id: { in: electionIds } } });
    await prisma.anonymousCommitment.deleteMany({ where: { election_id: { in: electionIds } } });
    await prisma.result.deleteMany({ where: { election_id: { in: electionIds } } });
    await prisma.anonymousElectionKey.deleteMany({ where: { election_id: { in: electionIds } } });
    await prisma.electoralRoll.deleteMany({ where: { election_id: { in: electionIds } } });
    await prisma.candiday.deleteMany({ where: { election_id: { in: electionIds } } });
    await prisma.election.deleteMany({ where: { id: { in: electionIds } } });
    await prisma.candidate.deleteMany({ where: { id: { in: candidateIds } } });
    await prisma.elector.deleteMany({ where: { id: { in: electorIds } } });
    await app.close();
  });

  // Fresh elector inside every election's roll, logged in. One credential per elector and
  // election is the rule under test, so each scenario gets its own voter.
  async function newVoter(): Promise<{ id: string; email: string; cookie: string }> {
    const tag = randomUUID().slice(0, 8);
    const elector = await seedElector(tag);
    for (const electionId of [activeElectionId, blankDisabledElectionId, futureElectionId]) {
      await prisma.electoralRoll.create({
        data: { election_id: electionId, elector_id: elector.id },
      });
    }
    return { ...elector, cookie: await login(elector.email) };
  }

  const expectError = (req: request.Test, status: number, code: string) =>
    req.expect(status).expect((res) => {
      expect((res.body as { error?: string }).error).toBe(code);
    });

  describe('happy path', () => {
    it('AV-01: issue with a cookie, vote without one, and receive a receipt', async () => {
      const voter = await newVoter();
      const { ballotId, signature, proof } = await obtainVote(
        activeElectionId,
        voter.cookie,
        candidacyId,
      );

      const vote = await castVote(activeElectionId, {
        candidacyId,
        ballotId,
        signatureHex: signature,
        proof,
      }).expect(201);
      expect(vote.body).toEqual({ receipt: ballotId });

      const receipt = await request(app.getHttpServer())
        .get(`/api/v1/elections/${activeElectionId}/anonymous-voting/receipts/${ballotId}`)
        .expect(200);
      const receiptBody: Record<string, unknown> = receipt.body as Record<string, unknown>;
      expect(receiptBody).toEqual({
        electionId: activeElectionId,
        ballotId,
        registeredAt: expect.any(String) as unknown,
      });
      expect(receiptBody).not.toHaveProperty('candidacyId');
    });

    it('AV-08: credential status flips from false to true after issuance', async () => {
      const voter = await newVoter();
      const status = () =>
        request(app.getHttpServer())
          .get(`/api/v1/elections/${activeElectionId}/anonymous-voting/credentials/status`)
          .set('Cookie', voter.cookie)
          .expect(200);

      expect((await status()).body).toEqual({ credentialIssued: false });
      await obtainVote(activeElectionId, voter.cookie, candidacyId);
      expect((await status()).body).toEqual({ credentialIssued: true });
    });

    it('AV-12: the public key is stable across calls', async () => {
      const first = await publicKeyPem(activeElectionId);
      const second = await publicKeyPem(activeElectionId);
      expect(first).toBe(second);
      expect(first).toContain('BEGIN PUBLIC KEY');
    });

    it('a blank vote is accepted when enabled', async () => {
      const voter = await newVoter();
      const blankElection = await seedElection({ blank: true });
      await prisma.electoralRoll.create({
        data: { election_id: blankElection, elector_id: voter.id },
      });
      const { ballotId, signature, proof } = await obtainVote(blankElection, voter.cookie, 'blank');

      await castVote(blankElection, {
        candidacyId: 'blank',
        ballotId,
        signatureHex: signature,
        proof,
      }).expect(201);
    });
  });

  describe('rejections', () => {
    it('AV-02: issuance without a cookie is 401', async () => {
      await issue(activeElectionId, undefined, {
        y: 'a'.repeat(64),
        blindedMessageHex: 'b'.repeat(512),
      }).expect(401);
    });

    it('AV-03: a second issuance to the same elector is 409', async () => {
      const voter = await newVoter();
      await obtainVote(activeElectionId, voter.cookie, candidacyId);

      const pem = await publicKeyPem(activeElectionId);
      const blind = await blindForElection(pem, activeElectionId, randomUUID());
      const again = issue(activeElectionId, voter.cookie, {
        y: await publicCommitmentHex(randomSecretHex()),
        blindedMessageHex: blind.blindedMessageHex,
      });
      await expectError(again, 409, 'BALLOT_CREDENTIAL_ALREADY_ISSUED');
    });

    it('AV-04: reusing a ballotId is 409 BALLOT_ALREADY_USED', async () => {
      const voter = await newVoter();
      const { ballotId, signature, proof } = await obtainVote(
        activeElectionId,
        voter.cookie,
        candidacyId,
      );
      const body = { candidacyId, ballotId, signatureHex: signature, proof };
      await castVote(activeElectionId, body).expect(201);

      await expectError(castVote(activeElectionId, body), 409, 'BALLOT_ALREADY_USED');
    });

    it('AV-05: a proof for an unregistered y is 403 NOT_ELIGIBLE', async () => {
      const ballotId = randomUUID();
      const stranger = randomSecretHex();
      const proof = await zkp.prove(stranger, {
        electionId: activeElectionId,
        ballotId,
        candidacyId,
      });

      await expectError(
        castVote(activeElectionId, {
          candidacyId,
          ballotId,
          signatureHex: 'ab'.repeat(256),
          proof,
        }),
        403,
        'NOT_ELIGIBLE',
      );
    });

    it('AV-06: an altered proof response is 422 INVALID_PROOF', async () => {
      const voter = await newVoter();
      const { ballotId, signature, proof } = await obtainVote(
        activeElectionId,
        voter.cookie,
        candidacyId,
      );
      const tampered = {
        ...proof,
        s: (BigInt(`0x${proof.s}`) + 1n).toString(16).padStart(64, '0'),
      };

      await expectError(
        castVote(activeElectionId, {
          candidacyId,
          ballotId,
          signatureHex: signature,
          proof: tampered,
        }),
        422,
        'INVALID_PROOF',
      );
    });

    it('AV-07: a signature that does not verify is 422 INVALID_SIGNATURE', async () => {
      const voter = await newVoter();
      const { ballotId, proof } = await obtainVote(activeElectionId, voter.cookie, candidacyId);

      await expectError(
        castVote(activeElectionId, {
          candidacyId,
          ballotId,
          signatureHex: 'cd'.repeat(256),
          proof,
        }),
        422,
        'INVALID_SIGNATURE',
      );
    });

    it('AV-10: blank vote when the election disables it is 409 BLANK_VOTE_DISABLED', async () => {
      const voter = await newVoter();
      const { ballotId, signature, proof } = await obtainVote(
        blankDisabledElectionId,
        voter.cookie,
        'blank',
      );

      await expectError(
        castVote(blankDisabledElectionId, {
          candidacyId: 'blank',
          ballotId,
          signatureHex: signature,
          proof,
        }),
        409,
        'BLANK_VOTE_DISABLED',
      );
    });

    it('AV-11: issuance outside the election window is 422', async () => {
      const voter = await newVoter();
      const pem = await publicKeyPem(futureElectionId);
      const blind = await blindForElection(pem, futureElectionId, randomUUID());

      await expectError(
        issue(futureElectionId, voter.cookie, {
          y: await publicCommitmentHex(randomSecretHex()),
          blindedMessageHex: blind.blindedMessageHex,
        }),
        422,
        'ELECTION_NOT_WITHIN_SCHEDULE',
      );
    });

    it('issuance by an elector outside the electoral roll is 404', async () => {
      const outsider = await seedElector(randomUUID().slice(0, 8));
      const cookie = await login(outsider.email);
      const pem = await publicKeyPem(activeElectionId);
      const blind = await blindForElection(pem, activeElectionId, randomUUID());

      await expectError(
        issue(activeElectionId, cookie, {
          y: await publicCommitmentHex(randomSecretHex()),
          blindedMessageHex: blind.blindedMessageHex,
        }),
        404,
        'ELECTORAL_ROLL_NOT_FOUND',
      );
    });

    it('a receipt for an unknown ballot is 404 BALLOT_RECEIPT_NOT_FOUND', async () => {
      await expectError(
        request(app.getHttpServer()).get(
          `/api/v1/elections/${activeElectionId}/anonymous-voting/receipts/${randomUUID()}`,
        ),
        404,
        'BALLOT_RECEIPT_NOT_FOUND',
      );
    });

    it('AV-15: rejected operations never write ballot, signature or commitment material to logs', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn');
      const error = jest.spyOn(Logger.prototype, 'error');
      try {
        const voter = await newVoter();
        const { ballotId, signature, proof } = await obtainVote(
          activeElectionId,
          voter.cookie,
          candidacyId,
        );
        const tampered = {
          ...proof,
          s: (BigInt(`0x${proof.s}`) + 1n).toString(16).padStart(64, '0'),
        };
        await castVote(activeElectionId, {
          candidacyId,
          ballotId,
          signatureHex: signature,
          proof: tampered,
        }).expect(422);
        await request(app.getHttpServer())
          .get(`/api/v1/elections/${activeElectionId}/anonymous-voting/receipts/${randomUUID()}`)
          .expect(404);

        const logged = [...warn.mock.calls, ...error.mock.calls]
          .map((args) => args.map(String).join(' '))
          .join('\n');
        expect(logged).not.toContain(ballotId);
        expect(logged).not.toContain(signature.slice(0, 32));
        expect(logged).not.toContain(proof.y);
        expect(logged).not.toContain(proof.s);
      } finally {
        warn.mockRestore();
        error.mockRestore();
      }
    });

    it('AV-14: the existing POST /elections/:id/votes is untouched (still requires a cookie)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/elections/${activeElectionId}/votes`)
        .send({ candidacyId })
        .expect(401);
    });

    it('results: 409 while the election is ACTIVE', async () => {
      await expectError(
        request(app.getHttpServer()).get(
          `/api/v1/elections/${activeElectionId}/anonymous-voting/results`,
        ),
        409,
        'RESULTS_NOT_AVAILABLE',
      );
    });

    it('results: once CLOSED, every candidacy is listed and blanks are a separate field', async () => {
      const closing = await seedElection();
      const cand = await prisma.candiday.create({
        data: { election_id: closing, candidate_id: candidateIds[0], position_number: 77 },
      });
      const voter = await newVoter();
      const pem = await publicKeyPem(closing);
      expect(pem).toContain('BEGIN PUBLIC KEY');
      await prisma.electoralRoll.create({ data: { election_id: closing, elector_id: voter.id } });
      const a = await obtainVote(closing, voter.cookie, cand.id);
      await castVote(closing, {
        candidacyId: cand.id,
        ballotId: a.ballotId,
        signatureHex: a.signature,
        proof: a.proof,
      }).expect(201);
      await prisma.election.update({ where: { id: closing }, data: { current_status: 'CLOSED' } });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/elections/${closing}/anonymous-voting/results`)
        .expect(200);
      const body = res.body as {
        totalVotes: number;
        blankVotes: number;
        candidacies: Array<{ candidacyId: string; votes: number }>;
      };
      expect(body.blankVotes).toBe(0);
      expect(body.totalVotes).toBe(1);
      expect(body.candidacies).toEqual(
        expect.arrayContaining([{ candidacyId: cand.id, votes: 1 }]),
      );
    });

    it('rejects malformed input before any database work (400)', async () => {
      const voter = await newVoter();
      await issue(activeElectionId, voter.cookie, { y: 'not-hex', blindedMessageHex: 'x' }).expect(
        400,
      );
      await castVote(activeElectionId, {
        candidacyId: 'nope',
        ballotId: 'nope',
        signatureHex: 'x',
        proof: {},
      }).expect(400);
    });
  });
});
