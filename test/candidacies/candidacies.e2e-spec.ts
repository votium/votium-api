import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { GlobalExceptionFilter } from '../../src/shared/exceptions/filters/global-exception.filter';
import {
  EMAIL_SERVICE_PORT,
  type EmailServicePort,
} from '../../src/modules/auth/application/ports/email-service.port';
import { NodeCryptoPasswordHasherService } from '../../src/modules/iam/infrastructure/services/node-crypto-password-hasher.service';
import { RoleName } from '../../src/modules/iam/domain/value-objects/role-name.vo';
import { UserStatus } from '../../src/modules/iam/domain/value-objects/user-status.vo';
import type { ElectionStatus } from '../../src/modules/elections/domain/entities/election.entity';

class FakeEmailService implements EmailServicePort {
  sent: Array<{ to: string; code: string }> = [];

  sendVerificationCode(to: string, code: string): Promise<void> {
    this.sent.push({ to, code });
    return Promise.resolve();
  }

  last(): { to: string; code: string } {
    return this.sent[this.sent.length - 1];
  }
}

interface LoginResponseBody {
  sessionId: string;
}

interface TokensResponseBody {
  accessToken: string;
}

describe('Candidacies registration (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let emailService: FakeEmailService;

  let adminUser: { id: string; email: string; password: string };
  let auditorUser: { id: string; email: string; password: string };

  const suffix = Date.now();

  let adminToken = '';
  let auditorToken = '';

  const createdElectionIds: string[] = [];
  const createdCandidateIds: string[] = [];

  const completeLogin = async (email: string, password: string): Promise<string> => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);

    const sessionId = (loginRes.body as LoginResponseBody).sessionId;
    const code = emailService.last().code;

    const verifyRes = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/verify')
      .send({ sessionId, code })
      .expect(201);

    return (verifyRes.body as TokensResponseBody).accessToken;
  };

  const registerCandidacy = (payload: Record<string, unknown>, token: string) =>
    request(app.getHttpServer())
      .post('/api/v1/candidacies')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

  async function seedElection(status: ElectionStatus): Promise<string> {
    const row = await prisma.election.create({
      data: {
        name: `E2E-CAND-${suffix}-${Math.random()}`,
        description: 'E2E candidacy seed.',
        start_date: new Date(Date.UTC(2026, 9, 1)),
        start_time: new Date(Date.UTC(1970, 0, 1, 8, 0, 0)),
        end_date: new Date(Date.UTC(2026, 9, 1)),
        end_time: new Date(Date.UTC(1970, 0, 1, 18, 0, 0)),
        current_status: status,
        blank_vote_enabled: false,
      },
    });
    createdElectionIds.push(row.id);
    return row.id;
  }

  async function seedCandidate(): Promise<string> {
    const row = await prisma.candidate.create({
      data: {
        first_name: 'E2E',
        last_name: 'Candidate',
        student_code: `SC-${suffix}-${Math.random()}`,
        program_code: '1234',
        identification_number: `ID-${suffix}-${Math.random()}`,
        status: 'ACTIVE',
      },
    });
    createdCandidateIds.push(row.id);
    return row.id;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(EMAIL_SERVICE_PORT)
      .useValue(new FakeEmailService())
      .compile();

    app = moduleFixture.createNestApplication();
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
    emailService = app.get<FakeEmailService>(EMAIL_SERVICE_PORT);

    const hasher = new NodeCryptoPasswordHasherService();
    const adminRole = await prisma.role.upsert({
      where: { name: RoleName.ADMINISTRATOR.value },
      update: {},
      create: { name: RoleName.ADMINISTRATOR.value },
    });
    const auditorRole = await prisma.role.upsert({
      where: { name: RoleName.AUDITOR.value },
      update: {},
      create: { name: RoleName.AUDITOR.value },
    });

    adminUser = {
      id: '',
      email: `e2e-candidacy-admin-${suffix}@example.com`,
      password: 'SuperSecret123!',
    };
    auditorUser = {
      id: '',
      email: `e2e-candidacy-auditor-${suffix}@example.com`,
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
    const createdAuditor = await prisma.user.create({
      data: {
        first_name: 'E2E',
        last_name: 'Auditor',
        email: auditorUser.email,
        password_hash: await hasher.hash(auditorUser.password),
        role_id: auditorRole.id,
        status: UserStatus.ACTIVE.value,
      },
    });
    adminUser.id = createdAdmin.id;
    auditorUser.id = createdAuditor.id;

    adminToken = await completeLogin(adminUser.email, adminUser.password);
    auditorToken = await completeLogin(auditorUser.email, auditorUser.password);
  });

  afterAll(async () => {
    await prisma.candiday.deleteMany({
      where: { election_id: { in: createdElectionIds } },
    });
    await prisma.candidate.deleteMany({ where: { id: { in: createdCandidateIds } } });
    await prisma.election.deleteMany({ where: { id: { in: createdElectionIds } } });
    const userIds = [adminUser.id, auditorUser.id];
    await prisma.mfaChallenge.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.auditLog.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  describe('POST /candidacies', () => {
    it('E2E-01: an ADMIN registers a candidate in a Pending election with 201 and DB row', async () => {
      const electionId = await seedElection('PENDING');
      const candidateId = await seedCandidate();

      const res = await registerCandidacy({ electionId, candidateId }, adminToken).expect(201);

      const body = res.body as Record<string, unknown>;
      expect(body).toMatchObject({
        electionId,
        candidateId,
        positionNumber: 1,
        imageUrl: null,
      });
      expect(body.id).toBeTruthy();
      expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);

      const row = await prisma.candiday.findUnique({ where: { id: body.id as string } });
      expect(row).not.toBeNull();
      expect(row!.election_id).toBe(electionId);
      expect(row!.candidate_id).toBe(candidateId);
      expect(row!.position_number).toBe(1);
    });

    it('E2E-02: the response represents the created candidacy without extra fields', async () => {
      const electionId = await seedElection('PENDING');
      const candidateId = await seedCandidate();

      const res = await registerCandidacy({ electionId, candidateId }, adminToken).expect(201);
      const body = res.body as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(
        ['id', 'electionId', 'candidateId', 'positionNumber', 'imageUrl', 'createdAt'].sort(),
      );
    });

    it('E2E-03: position auto-increments across two registrations in the same election', async () => {
      const electionId = await seedElection('PENDING');
      const candidateA = await seedCandidate();
      const candidateB = await seedCandidate();

      const first = await registerCandidacy(
        { electionId, candidateId: candidateA },
        adminToken,
      ).expect(201);
      const second = await registerCandidacy(
        { electionId, candidateId: candidateB },
        adminToken,
      ).expect(201);

      expect((first.body as { positionNumber: number }).positionNumber).toBe(1);
      expect((second.body as { positionNumber: number }).positionNumber).toBe(2);
    });

    it('E2E-04: unauthenticated request is rejected with 401', async () => {
      await registerCandidacy({ electionId: 'x', candidateId: 'y' }, '').expect(401);
    });

    it('E2E-05: an invalid token is rejected with 401', async () => {
      const res = await registerCandidacy(
        { electionId: 'x', candidateId: 'y' },
        'not-a-real-token',
      ).expect(401);
      expect(res.body).toMatchObject({ statusCode: 401 });
    });

    it('E2E-06: a non-admin role (AUDITOR) is rejected with 403', async () => {
      const electionId = await seedElection('PENDING');
      const candidateId = await seedCandidate();

      const res = await registerCandidacy({ electionId, candidateId }, auditorToken).expect(403);
      expect(res.body).toMatchObject({ statusCode: 403 });
      expect(await prisma.candiday.count({ where: { election_id: electionId } })).toBe(0);
    });

    it('E2E-07: a missing electionId is rejected with 400', async () => {
      const candidateId = await seedCandidate();
      await registerCandidacy({ candidateId }, adminToken).expect(400);
    });

    it('E2E-08: a missing candidateId is rejected with 400', async () => {
      const electionId = await seedElection('PENDING');
      await registerCandidacy({ electionId }, adminToken).expect(400);
    });

    it('E2E-09: a non-UUID electionId is rejected with 400', async () => {
      const candidateId = await seedCandidate();
      await registerCandidacy({ electionId: 'not-a-uuid', candidateId }, adminToken).expect(400);
    });

    it('E2E-10: a non-UUID candidateId is rejected with 400', async () => {
      const electionId = await seedElection('PENDING');
      await registerCandidacy({ electionId, candidateId: 'not-a-uuid' }, adminToken).expect(400);
    });

    it('E2E-11: an unknown body field is rejected with 400', async () => {
      const electionId = await seedElection('PENDING');
      const candidateId = await seedCandidate();
      await registerCandidacy({ electionId, candidateId, positionNumber: 99 }, adminToken).expect(
        400,
      );
    });

    it('E2E-12: a missing election is rejected with 404', async () => {
      const candidateId = await seedCandidate();
      const res = await registerCandidacy(
        { electionId: '00000000-0000-0000-0000-000000000000', candidateId },
        adminToken,
      ).expect(404);
      expect(res.body).toMatchObject({ statusCode: 404, error: 'ELECTION_NOT_FOUND' });
    });

    it('E2E-13: a missing candidate is rejected with 404', async () => {
      const electionId = await seedElection('PENDING');
      const res = await registerCandidacy(
        { electionId, candidateId: '00000000-0000-0000-0000-000000000000' },
        adminToken,
      ).expect(404);
      expect(res.body).toMatchObject({ statusCode: 404, error: 'CANDIDATE_NOT_FOUND' });
    });

    it('E2E-14: a duplicate candidacy is rejected with 409', async () => {
      const electionId = await seedElection('PENDING');
      const candidateId = await seedCandidate();
      await registerCandidacy({ electionId, candidateId }, adminToken).expect(201);

      const res = await registerCandidacy({ electionId, candidateId }, adminToken).expect(409);
      expect(res.body).toMatchObject({ statusCode: 409, error: 'CANDIDACY_DUPLICATE' });
      expect(await prisma.candiday.count({ where: { election_id: electionId } })).toBe(1);
    });

    it.each(['CREATED', 'PUBLISHED', 'ACTIVE', 'CLOSED'] as const)(
      'E2E-15/16/17/18: a %s election is rejected with 409',
      async (status) => {
        const electionId = await seedElection(status);
        const candidateId = await seedCandidate();

        const res = await registerCandidacy({ electionId, candidateId }, adminToken).expect(409);
        expect(res.body).toMatchObject({
          statusCode: 409,
          error: 'ELECTION_NOT_ELIGIBLE_FOR_CANDIDACY',
        });
        expect(await prisma.candiday.count({ where: { election_id: electionId } })).toBe(0);
      },
    );

    it('E2E-19: failed requests do not create unrelated rows', async () => {
      const electionId = await seedElection('PENDING');
      const candidateId = await seedCandidate();
      const before = await prisma.candiday.count();

      await registerCandidacy({ candidateId }, adminToken).expect(400);
      await registerCandidacy({ electionId, candidateId }, '').expect(401);
      await registerCandidacy({ electionId, candidateId }, auditorToken).expect(403);
      await registerCandidacy(
        { electionId: '00000000-0000-0000-0000-000000000000', candidateId },
        adminToken,
      ).expect(404);
      await registerCandidacy(
        { electionId, candidateId: '00000000-0000-0000-0000-000000000000' },
        adminToken,
      ).expect(404);

      const after = await prisma.candiday.count();
      expect(after).toBe(before);
    });
  });
});
