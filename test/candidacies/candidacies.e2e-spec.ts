import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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

interface SwaggerOperationShape {
  tags?: string[];
  summary?: string;
  security?: Array<Record<string, string[]>>;
  parameters?: Array<{ name?: string; in?: string; required?: boolean }>;
  requestBody?: { content?: Record<string, { schema?: { $ref?: string } }> };
  responses?: Record<string, { content?: { 'application/json'?: { schema?: { $ref?: string } } } }>;
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
      const before = await prisma.candiday.count({ where: { election_id: electionId } });

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

      const after = await prisma.candiday.count({ where: { election_id: electionId } });
      expect(after).toBe(before);
    });
  });

  describe('PATCH /candidacies/:id', () => {
    const patchCandidacy = (id: string, payload: Record<string, unknown>, token: string) =>
      request(app.getHttpServer())
        .patch(`/api/v1/candidacies/${id}`)
        .set('Authorization', `Bearer ${token}`)
        .send(payload);

    async function seedCandidacyRow(
      electionId: string,
      candidateId: string,
      positionNumber: number,
      imageUrl?: string | null,
    ): Promise<{ id: string; createdAt: Date }> {
      const row = await prisma.candiday.create({
        data: {
          election_id: electionId,
          candidate_id: candidateId,
          position_number: positionNumber,
          image_url: imageUrl ?? null,
        },
      });
      return { id: row.id, createdAt: row.created_at };
    }

    it('E2E-20: an ADMIN updates the positionNumber with 200 and persists the row', async () => {
      const electionId = await seedElection('PENDING');
      const candidateId = await seedCandidate();
      const { id } = await seedCandidacyRow(electionId, candidateId, 1);

      const res = await patchCandidacy(id, { positionNumber: 3 }, adminToken).expect(200);
      const body = res.body as Record<string, unknown>;
      expect(body.id).toBe(id);
      expect(body.positionNumber).toBe(3);
      expect(Object.keys(body).sort()).toEqual(
        ['id', 'electionId', 'candidateId', 'positionNumber', 'imageUrl', 'createdAt'].sort(),
      );

      const row = await prisma.candiday.findUnique({ where: { id } });
      expect(row!.position_number).toBe(3);
      expect(row!.candidate_id).toBe(candidateId);
    });

    it('E2E-21: an ADMIN sets the imageUrl with 200 and persists the row', async () => {
      const electionId = await seedElection('PENDING');
      const candidateId = await seedCandidate();
      const { id } = await seedCandidacyRow(electionId, candidateId, 1);

      const res = await patchCandidacy(
        id,
        { imageUrl: 'https://example.com/photo.png' },
        adminToken,
      ).expect(200);
      expect((res.body as Record<string, unknown>).imageUrl).toBe('https://example.com/photo.png');

      const row = await prisma.candiday.findUnique({ where: { id } });
      expect(row!.image_url).toBe('https://example.com/photo.png');
    });

    it('E2E-22: an ADMIN clears the imageUrl with null and persists the row', async () => {
      const electionId = await seedElection('PENDING');
      const candidateId = await seedCandidate();
      const { id } = await seedCandidacyRow(
        electionId,
        candidateId,
        1,
        'https://example.com/photo.png',
      );

      const res = await patchCandidacy(id, { imageUrl: null }, adminToken).expect(200);
      expect((res.body as Record<string, unknown>).imageUrl).toBeNull();

      const row = await prisma.candiday.findUnique({ where: { id } });
      expect(row!.image_url).toBeNull();
      expect(row!.position_number).toBe(1);
    });

    it('E2E-23: a partial update changes only the provided field', async () => {
      const electionId = await seedElection('PENDING');
      const candidateId = await seedCandidate();
      const { id } = await seedCandidacyRow(
        electionId,
        candidateId,
        1,
        'https://example.com/photo.png',
      );

      const res = await patchCandidacy(id, { positionNumber: 5 }, adminToken).expect(200);
      expect((res.body as Record<string, unknown>).positionNumber).toBe(5);
      expect((res.body as Record<string, unknown>).imageUrl).toBe('https://example.com/photo.png');

      const row = await prisma.candiday.findUnique({ where: { id } });
      expect(row!.position_number).toBe(5);
      expect(row!.image_url).toBe('https://example.com/photo.png');
    });

    it('E2E-24: immutable fields are preserved after an update', async () => {
      const electionId = await seedElection('PENDING');
      const candidateId = await seedCandidate();
      const { id, createdAt } = await seedCandidacyRow(electionId, candidateId, 1);

      const res = await patchCandidacy(id, { positionNumber: 2 }, adminToken).expect(200);
      const body = res.body as {
        id: string;
        electionId: string;
        candidateId: string;
        createdAt: string;
      };
      expect(body.id).toBe(id);
      expect(body.electionId).toBe(electionId);
      expect(body.candidateId).toBe(candidateId);
      expect(body.createdAt).toBe(createdAt.toISOString());

      const row = await prisma.candiday.findUnique({ where: { id } });
      expect(row!.election_id).toBe(electionId);
      expect(row!.candidate_id).toBe(candidateId);
      expect(row!.created_at.toISOString()).toBe(createdAt.toISOString());
    });

    it('E2E-25: an empty body is a 200 no-op', async () => {
      const electionId = await seedElection('PENDING');
      const candidateId = await seedCandidate();
      const { id } = await seedCandidacyRow(
        electionId,
        candidateId,
        1,
        'https://example.com/photo.png',
      );

      const res = await patchCandidacy(id, {}, adminToken).expect(200);
      expect((res.body as Record<string, unknown>).positionNumber).toBe(1);
      expect((res.body as Record<string, unknown>).imageUrl).toBe('https://example.com/photo.png');

      const row = await prisma.candiday.findUnique({ where: { id } });
      expect(row!.position_number).toBe(1);
      expect(row!.image_url).toBe('https://example.com/photo.png');
    });

    it('E2E-26: an unauthenticated request is rejected with 401', async () => {
      await patchCandidacy(
        '00000000-0000-0000-0000-000000000000',
        { positionNumber: 3 },
        '',
      ).expect(401);
    });

    it('E2E-27: an invalid token is rejected with 401', async () => {
      const res = await patchCandidacy(
        '00000000-0000-0000-0000-000000000000',
        { positionNumber: 3 },
        'not-a-real-token',
      ).expect(401);
      expect(res.body).toMatchObject({ statusCode: 401 });
    });

    it('E2E-28: a non-admin role (AUDITOR) is rejected with 403 and the row is unchanged', async () => {
      const electionId = await seedElection('PENDING');
      const candidateId = await seedCandidate();
      const { id } = await seedCandidacyRow(electionId, candidateId, 1);

      const res = await patchCandidacy(id, { positionNumber: 3 }, auditorToken).expect(403);
      expect(res.body).toMatchObject({ statusCode: 403 });

      const row = await prisma.candiday.findUnique({ where: { id } });
      expect(row!.position_number).toBe(1);
    });

    it('E2E-29: a non-UUID candidacy id is rejected with 400', async () => {
      await patchCandidacy('not-a-uuid', { positionNumber: 3 }, adminToken).expect(400);
    });

    it.each([0, -1, 1.5, '3'] as const)(
      'E2E-30: an invalid positionNumber (%s) is rejected with 400 and the row is unchanged',
      async (invalid) => {
        const electionId = await seedElection('PENDING');
        const candidateId = await seedCandidate();
        const { id } = await seedCandidacyRow(electionId, candidateId, 1);

        await patchCandidacy(id, { positionNumber: invalid }, adminToken).expect(400);

        const row = await prisma.candiday.findUnique({ where: { id } });
        expect(row!.position_number).toBe(1);
      },
    );

    it('E2E-31: an invalid imageUrl is rejected with 400 and the row is unchanged', async () => {
      const electionId = await seedElection('PENDING');
      const candidateId = await seedCandidate();
      const { id } = await seedCandidacyRow(electionId, candidateId, 1);

      await patchCandidacy(id, { imageUrl: 'not-a-url' }, adminToken).expect(400);

      const row = await prisma.candiday.findUnique({ where: { id } });
      expect(row!.image_url).toBeNull();
    });

    it.each(['electionId', 'candidateId', 'foo'] as const)(
      'E2E-32: an unknown or immutable body field (%s) is rejected with 400',
      async (unknownField) => {
        const electionId = await seedElection('PENDING');
        const candidateId = await seedCandidate();
        const { id } = await seedCandidacyRow(electionId, candidateId, 1);

        const payload =
          unknownField === 'foo'
            ? { foo: 'bar' }
            : { [unknownField]: unknownField === 'electionId' ? electionId : candidateId };

        await patchCandidacy(id, payload, adminToken).expect(400);

        const row = await prisma.candiday.findUnique({ where: { id } });
        expect(row!.position_number).toBe(1);
      },
    );

    it('E2E-33: a missing candidacy is rejected with 404 CANDIDACY_NOT_FOUND', async () => {
      const res = await patchCandidacy(
        '00000000-0000-0000-0000-000000000000',
        { positionNumber: 3 },
        adminToken,
      ).expect(404);
      expect(res.body).toMatchObject({ statusCode: 404, error: 'CANDIDACY_NOT_FOUND' });
    });

    it.each(['CREATED', 'PUBLISHED', 'ACTIVE', 'CLOSED'] as const)(
      'E2E-34: a %s election is rejected with 409 and the row is unchanged',
      async (status) => {
        const electionId = await seedElection(status);
        const candidateId = await seedCandidate();
        const { id } = await seedCandidacyRow(electionId, candidateId, 1);

        const res = await patchCandidacy(id, { positionNumber: 3 }, adminToken).expect(409);
        expect(res.body).toMatchObject({
          statusCode: 409,
          error: 'ELECTION_NOT_ELIGIBLE_FOR_CANDIDACY',
        });

        const row = await prisma.candiday.findUnique({ where: { id } });
        expect(row!.position_number).toBe(1);
      },
    );

    it('E2E-35: a duplicate position in the same election is rejected with 409', async () => {
      const electionId = await seedElection('PENDING');
      const candidateA = await seedCandidate();
      const candidateB = await seedCandidate();
      const { id: rowA } = await seedCandidacyRow(electionId, candidateA, 1);
      const { id: rowB } = await seedCandidacyRow(electionId, candidateB, 2);

      const res = await patchCandidacy(rowB, { positionNumber: 1 }, adminToken).expect(409);
      expect(res.body).toMatchObject({ statusCode: 409, error: 'CANDIDACY_DUPLICATE' });

      const rows = await prisma.candiday.findMany({
        where: { election_id: electionId },
        orderBy: { position_number: 'asc' },
      });
      expect(rows.map((row) => row.id)).toEqual([rowA, rowB]);
      expect(rows.map((row) => row.position_number)).toEqual([1, 2]);
    });

    it('E2E-36: updating to the same position of the same candidacy succeeds', async () => {
      const electionId = await seedElection('PENDING');
      const candidateId = await seedCandidate();
      const { id } = await seedCandidacyRow(electionId, candidateId, 1);

      const res = await patchCandidacy(id, { positionNumber: 1 }, adminToken).expect(200);
      expect((res.body as Record<string, unknown>).positionNumber).toBe(1);
    });

    it('E2E-37: the same position in a different election does not conflict', async () => {
      const electionA = await seedElection('PENDING');
      const electionB = await seedElection('PENDING');
      const candidateA = await seedCandidate();
      const candidateB = await seedCandidate();
      await seedCandidacyRow(electionA, candidateA, 1);
      const { id: rowB } = await seedCandidacyRow(electionB, candidateB, 1);

      const res = await patchCandidacy(rowB, { positionNumber: 1 }, adminToken).expect(200);
      expect((res.body as Record<string, unknown>).positionNumber).toBe(1);
    });

    it('E2E-38: failed requests leave the election rows unchanged', async () => {
      const electionId = await seedElection('PENDING');
      const candidateA = await seedCandidate();
      const candidateB = await seedCandidate();
      const { id: rowA } = await seedCandidacyRow(electionId, candidateA, 1);
      const { id: rowB } = await seedCandidacyRow(electionId, candidateB, 2);

      await patchCandidacy(rowA, { positionNumber: 0 }, adminToken).expect(400);
      await patchCandidacy(rowA, { imageUrl: 'not-a-url' }, adminToken).expect(400);
      await patchCandidacy(rowA, { positionNumber: 3 }, '').expect(401);
      await patchCandidacy(rowA, { positionNumber: 3 }, auditorToken).expect(403);
      await patchCandidacy(
        '00000000-0000-0000-0000-000000000000',
        { positionNumber: 3 },
        adminToken,
      ).expect(404);
      await patchCandidacy(rowB, { positionNumber: 1 }, adminToken).expect(409);

      expect(await prisma.candiday.count({ where: { election_id: electionId } })).toBe(2);
      const rows = await prisma.candiday.findMany({
        where: { election_id: electionId },
        orderBy: { position_number: 'asc' },
      });
      expect(rows.map((row) => row.id)).toEqual([rowA, rowB]);
      expect(rows.map((row) => row.position_number)).toEqual([1, 2]);
    });

    it('E2E-39: positionNumber null is treated as a no-op (200)', async () => {
      const electionId = await seedElection('PENDING');
      const candidateId = await seedCandidate();
      const { id } = await seedCandidacyRow(electionId, candidateId, 1);

      const res = await patchCandidacy(id, { positionNumber: null }, adminToken).expect(200);
      expect((res.body as Record<string, unknown>).positionNumber).toBe(1);

      const row = await prisma.candiday.findUnique({ where: { id } });
      expect(row!.position_number).toBe(1);
    });
  });

  describe('Swagger / OpenAPI', () => {
    it('SW9-SW17: the generated OpenAPI document documents the PATCH endpoint', () => {
      const config = new DocumentBuilder()
        .setTitle('Votium API')
        .setDescription('Electronic voting system API')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
      const document = SwaggerModule.createDocument(app, config);

      // SW9: the PATCH path exists for the candidacies resource.
      const pathKey = Object.keys(document.paths).find((p) => p.endsWith('/candidacies/{id}'));
      expect(pathKey).toBeDefined();

      // SW10: the patch operation is present.
      const operation = document.paths[pathKey!].patch as unknown as SwaggerOperationShape;
      expect(operation).toBeDefined();

      // SW11: the operation is grouped under the candidacies tag.
      expect(operation.tags).toContain('candidacies');

      // SW12: the id path parameter is documented.
      expect(operation.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'id',
            in: 'path',
            required: true,
          }),
        ]),
      );

      // SW13: the request body references the UpdateCandidacyDto schema.
      expect(operation.requestBody).toEqual(
        expect.objectContaining({
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UpdateCandidacyDto' },
            },
          },
        }),
      );

      // SW14: bearer authentication is documented at the operation level.
      expect(operation.security).toEqual([{ bearer: [] }]);
      expect(document.components?.securitySchemes?.bearer).toBeDefined();

      // SW15: the successful response schema matches the runtime response.
      const success = operation.responses?.['200'];
      expect(success).toBeDefined();
      expect(success?.content?.['application/json']?.schema?.$ref).toBe(
        '#/components/schemas/CandidacyResponseDto',
      );
      const responseSchema = document.components?.schemas?.['CandidacyResponseDto'] as
        | { properties?: { positionNumber?: unknown; imageUrl?: unknown } }
        | undefined;
      expect(responseSchema).toBeDefined();
      expect(responseSchema!.properties!.positionNumber).toBeDefined();
      expect(responseSchema!.properties!.imageUrl).toBeDefined();

      // SW16: the relevant error responses are documented.
      expect(operation.responses?.['400']).toBeDefined();
      expect(operation.responses?.['401']).toBeDefined();
      expect(operation.responses?.['403']).toBeDefined();
      expect(operation.responses?.['404']).toBeDefined();
      expect(operation.responses?.['409']).toBeDefined();

      // SW17: the operation summary is present.
      expect(operation.summary).toBeTruthy();
    });
  });
});
