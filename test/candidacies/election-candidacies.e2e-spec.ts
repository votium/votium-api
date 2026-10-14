import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { App } from 'supertest/types';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../../src/app.module';
import { envs } from '../../src/config';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { GlobalExceptionFilter } from '../../src/shared/exceptions/filters/global-exception.filter';
import {
  ASYNC_EMAIL_SERVICE_PORT,
  type AsyncEmailServicePort,
} from '../../src/modules/auth/application/ports/async-email-service.port';
import { NodeCryptoPasswordHasherService } from '../../src/modules/iam/infrastructure/services/node-crypto-password-hasher.service';
import { RoleName } from '../../src/modules/iam/domain/value-objects/role-name.vo';
import { UserStatus } from '../../src/modules/iam/domain/value-objects/user-status.vo';
import type { ElectionStatus } from '../../src/modules/elections/domain/entities/election.entity';
import { extractAuthCookie } from '../auth/auth-cookie.utils';

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

interface LoginResponseBody {
  sessionId: string;
}

interface PaginatedCandidaciesBody {
  data: Array<{
    id: string;
    positionNumber: number;
    imageUrl: string | null;
    createdAt: string;
    candidate: { id: string; firstName: string; lastName: string };
  }>;
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface SwaggerOperationShape {
  tags?: string[];
  summary?: string;
  security?: Array<Record<string, string[]>>;
  parameters?: Array<{ name?: string; in?: string; required?: boolean }>;
  responses?: Record<string, { content?: { 'application/json'?: { schema?: { $ref?: string } } } }>;
}

describe('Election candidacies query (e2e)', () => {
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

    return extractAuthCookie(verifyRes);
  };

  const getCandidacies = (electionId: string, query: Record<string, unknown>, token: string) =>
    request(app.getHttpServer())
      .get(`/api/v1/elections/${electionId}/candidacies`)
      .query(query)
      .set('Cookie', token);

  async function seedElection(status: ElectionStatus, name?: string): Promise<string> {
    const row = await prisma.election.create({
      data: {
        name: name ?? `E2E-CQ-${suffix}-${Math.random()}`,
        description: 'E2E candidacy query seed.',
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

  async function seedCandidate(
    overrides: { firstName?: string; lastName?: string; status?: string } = {},
  ): Promise<string> {
    const row = await prisma.candidate.create({
      data: {
        first_name: overrides.firstName ?? 'E2E',
        last_name: overrides.lastName ?? 'Candidate',
        student_code: `SC-${suffix}-${Math.random()}`,
        program_code: '1234',
        identification_number: `ID-${suffix}-${Math.random()}`,
        status: overrides.status ?? 'ACTIVE',
      },
    });
    createdCandidateIds.push(row.id);
    return row.id;
  }

  async function seedCandidacy(
    electionId: string,
    candidateId: string,
    positionNumber: number,
  ): Promise<void> {
    await prisma.candiday.create({
      data: {
        election_id: electionId,
        candidate_id: candidateId,
        position_number: positionNumber,
      },
    });
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ASYNC_EMAIL_SERVICE_PORT)
      .useValue(new FakeEmailService())
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
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
    emailService = app.get<FakeEmailService>(ASYNC_EMAIL_SERVICE_PORT);

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
      email: `e2e-candidacy-query-admin-${suffix}@example.com`,
      password: 'SuperSecret123!',
    };
    auditorUser = {
      id: '',
      email: `e2e-candidacy-query-auditor-${suffix}@example.com`,
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

  describe('GET /elections/:electionId/candidacies', () => {
    it('LC-01: an ADMIN retrieves the candidacies of an election in the paginated envelope', async () => {
      const electionId = await seedElection('PENDING', `E2E-CQ-01-${suffix}`);
      const candidateA = await seedCandidate({ firstName: 'Ana', lastName: 'Lopez' });
      const candidateB = await seedCandidate({ firstName: 'Luis', lastName: 'Mora' });
      await seedCandidacy(electionId, candidateA, 2);
      await seedCandidacy(electionId, candidateB, 1);

      const res = await getCandidacies(electionId, {}, adminToken).expect(200);
      const body = res.body as PaginatedCandidaciesBody;

      expect(body.data).toHaveLength(2);
      expect(body.data.map((item) => item.positionNumber)).toEqual([1, 2]);
      expect(body.meta).toMatchObject({ page: 1, limit: 10, total: 2, totalPages: 1 });
    });

    it('LC-02: an AUDITOR also retrieves the candidacies', async () => {
      const electionId = await seedElection('PENDING');
      const candidateId = await seedCandidate({ firstName: 'Ana', lastName: 'Lopez' });
      await seedCandidacy(electionId, candidateId, 1);

      const res = await getCandidacies(electionId, {}, auditorToken).expect(200);
      const body = res.body as PaginatedCandidaciesBody;

      expect(body.data).toHaveLength(1);
      expect(body.data[0].candidate.firstName).toBe('Ana');
    });

    it('LC-03: candidacies are scoped to the requested election only', async () => {
      const electionA = await seedElection('PENDING');
      const electionB = await seedElection('PENDING');
      const candidateA = await seedCandidate({ firstName: 'Ana', lastName: 'Lopez' });
      const candidateB = await seedCandidate({ firstName: 'Luis', lastName: 'Mora' });
      await seedCandidacy(electionA, candidateA, 1);
      await seedCandidacy(electionB, candidateB, 1);

      const res = await getCandidacies(electionA, {}, adminToken).expect(200);
      const body = res.body as PaginatedCandidaciesBody;

      expect(body.data).toHaveLength(1);
      expect(body.data[0].candidate.lastName).toBe('Lopez');
      expect(body.meta.total).toBe(1);
    });

    it('LC-04: page and limit slice the result and the totals are scoped to the election', async () => {
      const electionId = await seedElection('PENDING');
      const a = await seedCandidate({ firstName: 'Ana', lastName: 'Lopez' });
      const b = await seedCandidate({ firstName: 'Bruno', lastName: 'Lopez' });
      const c = await seedCandidate({ firstName: 'Carlos', lastName: 'Lopez' });
      await seedCandidacy(electionId, a, 1);
      await seedCandidacy(electionId, b, 2);
      await seedCandidacy(electionId, c, 3);

      const page1 = (
        await getCandidacies(electionId, { page: 1, limit: 2 }, adminToken).expect(200)
      ).body as PaginatedCandidaciesBody;
      expect(page1.data.map((i) => i.positionNumber)).toEqual([1, 2]);
      expect(page1.meta).toMatchObject({ page: 1, limit: 2, total: 3, totalPages: 2 });

      const page2 = (
        await getCandidacies(electionId, { page: 2, limit: 2 }, adminToken).expect(200)
      ).body as PaginatedCandidaciesBody;
      expect(page2.data.map((i) => i.positionNumber)).toEqual([3]);
      expect(page2.meta).toMatchObject({ page: 2, limit: 2, total: 3, totalPages: 2 });
    });

    it('LC-05: candidateName filters with a partial, case-insensitive first-name match', async () => {
      const electionId = await seedElection('PENDING');
      const candidateA = await seedCandidate({ firstName: 'Ana', lastName: 'Lopez' });
      const candidateB = await seedCandidate({ firstName: 'Bruno', lastName: 'Lopez' });
      await seedCandidacy(electionId, candidateA, 1);
      await seedCandidacy(electionId, candidateB, 2);

      const res = await getCandidacies(electionId, { candidateName: 'an' }, adminToken).expect(200);
      const body = res.body as PaginatedCandidaciesBody;

      expect(body.data).toHaveLength(1);
      expect(body.data[0].candidate.firstName).toBe('Ana');
      expect(body.meta.total).toBe(1);
    });

    it('LC-06: candidateName also matches the candidate last name', async () => {
      const electionId = await seedElection('PENDING');
      const candidateA = await seedCandidate({ firstName: 'Ana', lastName: 'Garcia' });
      const candidateB = await seedCandidate({ firstName: 'Luis', lastName: 'Mora' });
      await seedCandidacy(electionId, candidateA, 1);
      await seedCandidacy(electionId, candidateB, 2);

      const res = await getCandidacies(electionId, { candidateName: 'garcia' }, adminToken).expect(
        200,
      );
      const body = res.body as PaginatedCandidaciesBody;

      expect(body.data).toHaveLength(1);
      expect(body.data[0].candidate.lastName).toBe('Garcia');
    });

    it('LC-07: an existing election without candidacies returns an empty paginated result', async () => {
      const electionId = await seedElection('PUBLISHED');

      const res = await getCandidacies(electionId, {}, adminToken).expect(200);
      const body = res.body as PaginatedCandidaciesBody;

      expect(body.data).toEqual([]);
      expect(body.meta).toMatchObject({ total: 0, totalPages: 0 });
    });

    it('LC-08: a nonexistent election is rejected with 404', async () => {
      const res = await getCandidacies(
        '00000000-0000-0000-0000-000000000000',
        {},
        adminToken,
      ).expect(404);

      expect(res.body).toMatchObject({ statusCode: 404, error: 'ELECTION_NOT_FOUND' });
    });

    it('LC-09: a non-UUID electionId is rejected with 400', async () => {
      await getCandidacies('not-a-uuid', {}, adminToken).expect(400);
    });

    it.each([
      ['page 0', { page: 0 }],
      ['negative page', { page: -1 }],
      ['non-integer page', { page: 'x' }],
      ['limit 0', { limit: 0 }],
      ['negative limit', { limit: -1 }],
    ])('LC-10: invalid pagination (%s) is rejected with 400', async (_label, query) => {
      const electionId = await seedElection('PENDING');

      await getCandidacies(electionId, query, adminToken).expect(400);
    });

    it('LC-11: an unknown query parameter is rejected with 400', async () => {
      const electionId = await seedElection('PENDING');

      await getCandidacies(electionId, { unknownParam: 'x' }, adminToken).expect(400);
    });

    it('LC-12: unauthenticated and invalid-token requests are rejected with 401', async () => {
      const electionId = await seedElection('PENDING');

      await getCandidacies(electionId, {}, '').expect(401);
      const res = await getCandidacies(electionId, {}, 'not-a-real-token').expect(401);
      expect(res.body).toMatchObject({ statusCode: 401 });
    });

    it('LC-13: INACTIVE candidates are excluded from the results', async () => {
      const electionId = await seedElection('PENDING');
      const active = await seedCandidate({ firstName: 'Ana', lastName: 'Lopez' });
      const inactive = await seedCandidate({
        firstName: 'Luis',
        lastName: 'Mora',
        status: 'INACTIVE',
      });
      await seedCandidacy(electionId, active, 1);
      await seedCandidacy(electionId, inactive, 2);

      const res = await getCandidacies(electionId, {}, adminToken).expect(200);
      const body = res.body as PaginatedCandidaciesBody;

      expect(body.data).toHaveLength(1);
      expect(body.data[0].candidate.firstName).toBe('Ana');
      expect(body.meta.total).toBe(1);
    });

    it('LC-14: logically deleted candidates are excluded from the results', async () => {
      const electionId = await seedElection('PENDING');
      const active = await seedCandidate({ firstName: 'Ana', lastName: 'Lopez' });
      const deleted = await seedCandidate({ firstName: 'Luis', lastName: 'Mora' });
      await seedCandidacy(electionId, active, 1);
      await seedCandidacy(electionId, deleted, 2);
      await prisma.candidate.update({
        where: { id: deleted },
        data: { deleted_at: new Date() },
      });

      const res = await getCandidacies(electionId, {}, adminToken).expect(200);
      const body = res.body as PaginatedCandidaciesBody;

      expect(body.data).toHaveLength(1);
      expect(body.data[0].candidate.firstName).toBe('Ana');
    });

    it('LC-15: the response contains exactly the documented fields', async () => {
      const electionId = await seedElection('PENDING');
      const candidateId = await seedCandidate({ firstName: 'Ana', lastName: 'Lopez' });
      await seedCandidacy(electionId, candidateId, 1);

      const res = await getCandidacies(electionId, {}, adminToken).expect(200);
      const body = res.body as PaginatedCandidaciesBody;

      expect(Object.keys(body).sort()).toEqual(['data', 'meta']);
      expect(Object.keys(body.meta).sort()).toEqual(['limit', 'page', 'total', 'totalPages']);
      const item = body.data[0];
      expect(Object.keys(item).sort()).toEqual([
        'candidate',
        'createdAt',
        'id',
        'imageUrl',
        'positionNumber',
      ]);
      expect(Object.keys(item.candidate).sort()).toEqual(['firstName', 'id', 'lastName']);
    });

    it('LC-16: no sensitive information leaks in the response', async () => {
      const electionId = await seedElection('PENDING');
      const candidateId = await seedCandidate({ firstName: 'Ana', lastName: 'Lopez' });
      await seedCandidacy(electionId, candidateId, 1);

      const res = await getCandidacies(electionId, {}, adminToken).expect(200);
      const serialized = JSON.stringify(res.body).toLowerCase();

      expect(serialized).not.toContain('password');
      expect(serialized).not.toContain('studentcode');
      expect(serialized).not.toContain('programcode');
      expect(serialized).not.toContain('identificationnumber');
      expect(serialized).not.toContain('status');
    });
  });

  describe('Swagger / OpenAPI', () => {
    it('SW1-SW8: the generated OpenAPI document documents the GET endpoint', () => {
      const config = new DocumentBuilder()
        .setTitle('Votium API')
        .setDescription('Electronic voting system API')
        .setVersion('1.0')
        .addCookieAuth(envs.authCookieName)
        .build();
      const document = SwaggerModule.createDocument(app, config);

      // SW1: the path exists (global prefix may or may not be prefixed
      // depending on the running NestJS/swagger version).
      const pathKey = Object.keys(document.paths).find((p) =>
        p.endsWith('/elections/{electionId}/candidacies'),
      );
      expect(pathKey).toBeDefined();
      const operation = document.paths[pathKey!].get as unknown as SwaggerOperationShape;
      expect(operation).toBeDefined();

      // SW2: the operation is grouped under the candidacies tag.
      expect(operation.tags).toContain('candidacies');

      // SW3: the election identifier path parameter is documented.
      expect(operation.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'electionId',
            in: 'path',
            required: true,
          }),
        ]),
      );

      // SW4: pagination and candidateName query parameters are documented as optional.
      expect(operation.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'page', in: 'query', required: false }),
          expect.objectContaining({ name: 'limit', in: 'query', required: false }),
          expect.objectContaining({ name: 'candidateName', in: 'query', required: false }),
        ]),
      );

      // SW5: authentication is documented at the operation level.
      expect(operation.security).toEqual([{ cookie: [] }]);
      expect(document.components?.securitySchemes?.cookie).toBeDefined();

      // SW6: the successful response schema matches the paginated runtime response.
      const success = operation.responses?.['200'];
      expect(success).toBeDefined();
      const schemaRef = success?.content?.['application/json']?.schema?.$ref;
      expect(schemaRef).toBe('#/components/schemas/ElectionCandidaciesListResponseDto');
      const responseSchema = document.components?.schemas?.[
        'ElectionCandidaciesListResponseDto'
      ] as
        | {
            properties?: {
              data?: { type?: string; items?: { $ref?: string } };
              meta?: { $ref?: string };
            };
          }
        | undefined;
      expect(responseSchema).toBeDefined();
      expect(responseSchema!.properties!.data).toMatchObject({
        type: 'array',
        items: { $ref: '#/components/schemas/CandidacyWithCandidateResponseDto' },
      });
      expect(responseSchema!.properties!.meta).toMatchObject({
        $ref: '#/components/schemas/PaginatedMetaDto',
      });
      const itemSchema = document.components?.schemas?.['CandidacyWithCandidateResponseDto'] as
        | {
            properties?: {
              id?: unknown;
              positionNumber?: unknown;
              imageUrl?: unknown;
              createdAt?: unknown;
              candidate?: { $ref?: string };
            };
          }
        | undefined;
      expect(itemSchema).toBeDefined();
      expect(itemSchema!.properties!.candidate).toMatchObject({
        $ref: '#/components/schemas/CandidateBriefResponseDto',
      });

      // SW7: the relevant error responses are documented.
      expect(operation.responses?.['400']).toBeDefined();
      expect(operation.responses?.['401']).toBeDefined();
      expect(operation.responses?.['403']).toBeDefined();
      expect(operation.responses?.['404']).toBeDefined();

      // SW8: the operation summary is present.
      expect(operation.summary).toBeTruthy();
    });

    it('SW-ASSOC: the generated OpenAPI document documents the POST association endpoint', () => {
      const config = new DocumentBuilder()
        .setTitle('Votium API')
        .setDescription('Electronic voting system API')
        .setVersion('1.0')
        .addCookieAuth(envs.authCookieName)
        .build();
      const document = SwaggerModule.createDocument(app, config);

      const pathKey = Object.keys(document.paths).find((p) =>
        p.endsWith('/elections/{electionId}/candidacies'),
      );
      expect(pathKey).toBeDefined();
      const operation = document.paths[pathKey!].post as unknown as SwaggerOperationShape & {
        requestBody?: {
          content?: Record<string, { schema?: { $ref?: string } }>;
        };
      };
      expect(operation).toBeDefined();

      // Grouped under candidacies; electionId path param documented.
      expect(operation.tags).toContain('candidacies');
      expect(operation.parameters).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'electionId', in: 'path', required: true }),
        ]),
      );

      // The request body references the AssociateCandidacyDto schema.
      expect(operation.requestBody?.content?.['application/json']?.schema?.$ref).toBe(
        '#/components/schemas/AssociateCandidacyDto',
      );

      // The association schema has no electionId property.
      const bodySchema = document.components?.schemas?.['AssociateCandidacyDto'] as
        | { properties?: Record<string, unknown> }
        | undefined;
      expect(bodySchema?.properties).not.toHaveProperty('electionId');
      expect(bodySchema?.properties).toHaveProperty('candidateId');

      // Success and relevant error responses are documented.
      expect(operation.responses?.['201']).toBeDefined();
      expect(operation.responses?.['400']).toBeDefined();
      expect(operation.responses?.['401']).toBeDefined();
      expect(operation.responses?.['403']).toBeDefined();
      expect(operation.responses?.['404']).toBeDefined();
      expect(operation.responses?.['409']).toBeDefined();
    });
  });
});
