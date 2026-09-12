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
  responses?: Record<string, { description?: string; content?: unknown }>;
}

describe('Candidacy deletion (e2e)', () => {
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

  const deleteCandidacy = (electionId: string, candidacyId: string, token: string) =>
    request(app.getHttpServer())
      .delete(`/api/v1/elections/${electionId}/candidacies/${candidacyId}`)
      .set('Authorization', `Bearer ${token}`);

  const registerCandidacy = (payload: Record<string, unknown>, token: string) =>
    request(app.getHttpServer())
      .post('/api/v1/candidacies')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

  async function seedElection(status: ElectionStatus): Promise<string> {
    const row = await prisma.election.create({
      data: {
        name: `E2E-DEL-${suffix}-${Math.random()}`,
        description: 'E2E candidacy deletion seed.',
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

  async function seedCandidacyRow(
    electionId: string,
    candidateId: string,
    positionNumber: number,
  ): Promise<string> {
    const row = await prisma.candiday.create({
      data: {
        election_id: electionId,
        candidate_id: candidateId,
        position_number: positionNumber,
      },
    });
    return row.id;
  }

  async function positionNumbers(electionId: string): Promise<number[]> {
    const rows = await prisma.candiday.findMany({
      where: { election_id: electionId },
      orderBy: { position_number: 'asc' },
    });
    return rows.map((row) => row.position_number);
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
      email: `e2e-candidacy-deletion-admin-${suffix}@example.com`,
      password: 'SuperSecret123!',
    };
    auditorUser = {
      id: '',
      email: `e2e-candidacy-deletion-auditor-${suffix}@example.com`,
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

  describe('DELETE /elections/:electionId/candidacies/:candidacyId', () => {
    it('E2E-D1: an ADMIN deletes a candidacy from a Pending election with 204 and the DB row is removed', async () => {
      const electionId = await seedElection('PENDING');
      const candidateA = await seedCandidate();
      const candidateB = await seedCandidate();
      const rowA = await seedCandidacyRow(electionId, candidateA, 1);
      const rowB = await seedCandidacyRow(electionId, candidateB, 2);

      const res = await deleteCandidacy(electionId, rowB, adminToken).expect(204);
      expect(res.body).toEqual({});

      expect(await prisma.candiday.findUnique({ where: { id: rowB } })).toBeNull();
      expect(await prisma.candiday.findUnique({ where: { id: rowA } })).not.toBeNull();
      expect(await positionNumbers(electionId)).toEqual([1]);
      // The Candidate person record is untouched.
      expect(await prisma.candidate.findUnique({ where: { id: candidateB } })).not.toBeNull();
    });

    it('E2E-D2: a non-existing candidacy is rejected with 404 CANDIDACY_NOT_FOUND', async () => {
      const electionId = await seedElection('PENDING');

      const res = await deleteCandidacy(
        electionId,
        '00000000-0000-0000-0000-000000000000',
        adminToken,
      ).expect(404);
      expect(res.body).toMatchObject({ statusCode: 404, error: 'CANDIDACY_NOT_FOUND' });
    });

    it('E2E-D3: a non-existing election is rejected with 404 ELECTION_NOT_FOUND', async () => {
      const candidateId = await seedCandidate();
      const electionId = await seedElection('PENDING');
      const rowId = await seedCandidacyRow(electionId, candidateId, 1);

      const res = await deleteCandidacy(
        '00000000-0000-0000-0000-000000000000',
        rowId,
        adminToken,
      ).expect(404);
      expect(res.body).toMatchObject({ statusCode: 404, error: 'ELECTION_NOT_FOUND' });
      expect(await prisma.candiday.findUnique({ where: { id: rowId } })).not.toBeNull();
    });

    it('E2E-D4: a candidacy from another election is rejected with 404 and the source row is preserved', async () => {
      const electionA = await seedElection('PENDING');
      const electionB = await seedElection('PENDING');
      const candidateB = await seedCandidate();
      const rowB = await seedCandidacyRow(electionB, candidateB, 1);

      const res = await deleteCandidacy(electionA, rowB, adminToken).expect(404);
      expect(res.body).toMatchObject({ statusCode: 404, error: 'CANDIDACY_NOT_FOUND' });
      expect(await prisma.candiday.findUnique({ where: { id: rowB } })).not.toBeNull();
    });

    it.each(['CREATED', 'PUBLISHED', 'ACTIVE', 'CLOSED'] as const)(
      'E2E-D5: a %s election is rejected with 409 and the row is unchanged',
      async (status) => {
        const electionId = await seedElection(status);
        const candidateId = await seedCandidate();
        const rowId = await seedCandidacyRow(electionId, candidateId, 1);

        const res = await deleteCandidacy(electionId, rowId, adminToken).expect(409);
        expect(res.body).toMatchObject({
          statusCode: 409,
          error: 'ELECTION_NOT_ELIGIBLE_FOR_CANDIDACY',
        });
        expect(await prisma.candiday.findUnique({ where: { id: rowId } })).not.toBeNull();
      },
    );

    it('E2E-D6: unauthenticated and invalid-token requests are rejected with 401', async () => {
      const electionId = await seedElection('PENDING');
      const candidateId = await seedCandidate();
      const rowId = await seedCandidacyRow(electionId, candidateId, 1);

      await deleteCandidacy(electionId, rowId, '').expect(401);
      const res = await deleteCandidacy(electionId, rowId, 'not-a-real-token').expect(401);
      expect(res.body).toMatchObject({ statusCode: 401 });
      expect(await prisma.candiday.findUnique({ where: { id: rowId } })).not.toBeNull();
    });

    it('E2E-D7: a non-admin role (AUDITOR) is rejected with 403 and the row is unchanged', async () => {
      const electionId = await seedElection('PENDING');
      const candidateId = await seedCandidate();
      const rowId = await seedCandidacyRow(electionId, candidateId, 1);

      const res = await deleteCandidacy(electionId, rowId, auditorToken).expect(403);
      expect(res.body).toMatchObject({ statusCode: 403 });
      expect(await prisma.candiday.findUnique({ where: { id: rowId } })).not.toBeNull();
    });

    it('E2E-D8: a non-UUID electionId or candidacyId is rejected with 400', async () => {
      const electionId = await seedElection('PENDING');
      const candidateId = await seedCandidate();
      const rowId = await seedCandidacyRow(electionId, candidateId, 1);

      await deleteCandidacy('not-a-uuid', rowId, adminToken).expect(400);
      await deleteCandidacy(electionId, 'not-a-uuid', adminToken).expect(400);
      expect(await prisma.candiday.findUnique({ where: { id: rowId } })).not.toBeNull();
    });

    it('E2E-D9: deleting number 2 from 1,2,3 leaves 1,3 and the next registration reuses 2', async () => {
      const electionId = await seedElection('PENDING');
      const candidateA = await seedCandidate();
      const candidateB = await seedCandidate();
      const candidateC = await seedCandidate();
      await seedCandidacyRow(electionId, candidateA, 1);
      const rowB = await seedCandidacyRow(electionId, candidateB, 2);
      await seedCandidacyRow(electionId, candidateC, 3);

      await deleteCandidacy(electionId, rowB, adminToken).expect(204);
      expect(await positionNumbers(electionId)).toEqual([1, 3]);

      const candidateD = await seedCandidate();
      const res = await registerCandidacy(
        { electionId, candidateId: candidateD },
        adminToken,
      ).expect(201);
      expect((res.body as { positionNumber: number }).positionNumber).toBe(2);
      expect(await positionNumbers(electionId)).toEqual([1, 2, 3]);
    });

    it('E2E-D10: deleting the only candidacy leaves zero candidates and the next registration starts at 1', async () => {
      const electionId = await seedElection('PENDING');
      const candidateA = await seedCandidate();
      const rowA = await seedCandidacyRow(electionId, candidateA, 1);

      await deleteCandidacy(electionId, rowA, adminToken).expect(204);
      expect(await prisma.candiday.count({ where: { election_id: electionId } })).toBe(0);

      const candidateB = await seedCandidate();
      const res = await registerCandidacy(
        { electionId, candidateId: candidateB },
        adminToken,
      ).expect(201);
      expect((res.body as { positionNumber: number }).positionNumber).toBe(1);
    });

    it('E2E-D11: deletion never renumbers the remaining candidacies', async () => {
      const electionId = await seedElection('PENDING');
      const candidateA = await seedCandidate();
      const candidateB = await seedCandidate();
      const candidateC = await seedCandidate();
      await seedCandidacyRow(electionId, candidateA, 1);
      const rowB = await seedCandidacyRow(electionId, candidateB, 2);
      await seedCandidacyRow(electionId, candidateC, 3);

      await deleteCandidacy(electionId, rowB, adminToken).expect(204);

      const rows = await prisma.candiday.findMany({
        where: { election_id: electionId },
        orderBy: { position_number: 'asc' },
      });
      expect(rows.map((row) => row.position_number)).toEqual([1, 3]);
    });

    it('E2E-D12: failed requests leave the election rows unchanged', async () => {
      const electionId = await seedElection('PENDING');
      const published = await seedElection('PUBLISHED');
      const candidateA = await seedCandidate();
      const candidateB = await seedCandidate();
      const candidateC = await seedCandidate();
      const rowA = await seedCandidacyRow(electionId, candidateA, 1);
      const rowB = await seedCandidacyRow(electionId, candidateB, 2);
      const publishedRow = await seedCandidacyRow(published, candidateC, 1);

      await deleteCandidacy('not-a-uuid', rowA, adminToken).expect(400);
      await deleteCandidacy(electionId, rowB, '').expect(401);
      await deleteCandidacy(electionId, rowB, auditorToken).expect(403);
      await deleteCandidacy(electionId, '00000000-0000-0000-0000-000000000000', adminToken).expect(
        404,
      );
      await deleteCandidacy('00000000-0000-0000-0000-000000000000', rowA, adminToken).expect(404);
      await deleteCandidacy(published, publishedRow, adminToken).expect(409);

      expect(await positionNumbers(electionId)).toEqual([1, 2]);
      expect(await prisma.candiday.findUnique({ where: { id: rowA } })).not.toBeNull();
      expect(await prisma.candiday.findUnique({ where: { id: rowB } })).not.toBeNull();
      expect(await prisma.candiday.findUnique({ where: { id: publishedRow } })).not.toBeNull();
    });
  });

  describe('Swagger / OpenAPI', () => {
    it('E2E-D13: the generated OpenAPI document documents the DELETE endpoint', () => {
      const config = new DocumentBuilder()
        .setTitle('Votium API')
        .setDescription('Electronic voting system API')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
      const document = SwaggerModule.createDocument(app, config);

      // SW-D1: the DELETE path exists.
      const pathKey = Object.keys(document.paths).find((p) =>
        p.endsWith('/elections/{electionId}/candidacies/{candidacyId}'),
      );
      expect(pathKey).toBeDefined();

      // SW-D2: the delete operation is present.
      const operation = document.paths[pathKey!].delete as unknown as SwaggerOperationShape;
      expect(operation).toBeDefined();

      // SW-D3: the operation is grouped under the candidacies tag.
      expect(operation.tags).toContain('candidacies');

      // SW-D4: both path parameters are documented.
      expect(operation.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'electionId', in: 'path', required: true }),
          expect.objectContaining({ name: 'candidacyId', in: 'path', required: true }),
        ]),
      );

      // SW-D5: bearer authentication is documented at the operation level.
      expect(operation.security).toEqual([{ bearer: [] }]);
      expect(document.components?.securitySchemes?.bearer).toBeDefined();

      // SW-D6: the 204 response is documented without a body schema.
      const success = operation.responses?.['204'];
      expect(success).toBeDefined();
      expect(success?.content).toBeUndefined();

      // SW-D7: the relevant error responses are documented.
      expect(operation.responses?.['400']).toBeDefined();
      expect(operation.responses?.['401']).toBeDefined();
      expect(operation.responses?.['403']).toBeDefined();
      expect(operation.responses?.['404']).toBeDefined();
      expect(operation.responses?.['409']).toBeDefined();

      // SW-D8: the operation summary is present.
      expect(operation.summary).toBeTruthy();
    });
  });
});
