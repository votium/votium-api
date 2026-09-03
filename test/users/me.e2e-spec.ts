import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '../../src/app.module';
import { AuthModule } from '../../src/modules/auth/auth.module';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { GlobalExceptionFilter } from '../../src/shared/exceptions/filters/global-exception.filter';
import {
  EMAIL_SERVICE_PORT,
  type EmailServicePort,
} from '../../src/modules/auth/application/ports/email-service.port';
import { NodeCryptoPasswordHasherService } from '../../src/modules/iam/infrastructure/services/node-crypto-password-hasher.service';
import { RoleName } from '../../src/modules/iam/domain/value-objects/role-name.vo';
import { UserStatus } from '../../src/modules/iam/domain/value-objects/user-status.vo';
import { envs } from '../../src/config';

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

interface VerifyResponseBody {
  accessToken: string;
}

interface ErrorBody {
  statusCode: number;
  message: string | string[];
}

interface MeResponse {
  user: { id: string; role: string; name: string; email: string };
}

describe('GET /users/me (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let emailService: FakeEmailService;

  let adminUser: { id: string; email: string; firstName: string; lastName: string };
  let auditorUser: { id: string; email: string; firstName: string; lastName: string };
  let activeElector: { id: string; email: string; password: string };

  const suffix = Date.now();
  const usedUserIds: string[] = [];
  const usedStudentCodes: string[] = [];

  let adminToken = '';
  let auditorToken = '';
  let electorToken = '';

  const completeAdminLogin = async (email: string, password: string): Promise<string> => {
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

    return (verifyRes.body as VerifyResponseBody).accessToken;
  };

  const completeElectorLogin = async (email: string, password: string): Promise<string> => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/electors/auth/login')
      .send({ email, password })
      .expect(200);

    const sessionId = (loginRes.body as LoginResponseBody).sessionId;
    const code = emailService.last().code;

    const verifyRes = await request(app.getHttpServer())
      .post('/api/v1/electors/auth/mfa/verify')
      .send({ sessionId, code })
      .expect(201);

    return (verifyRes.body as VerifyResponseBody).accessToken;
  };

  const meGet = (token?: string, extra: Record<string, string> = {}) => {
    const req = request(app.getHttpServer()).get('/api/v1/users/me');
    if (token) req.set('Authorization', `Bearer ${token}`);
    Object.entries(extra).forEach(([k, v]) => {
      req.set(k, v);
    });
    return req;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, AuthModule],
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

    const adminPassword = 'SuperSecret123!';
    const auditorPassword = 'SuperSecret123!';

    const createdAdmin = await prisma.user.create({
      data: {
        first_name: 'Jane',
        last_name: 'Admin',
        email: `e2e-me-admin-${suffix}@example.com`,
        password_hash: await hasher.hash(adminPassword),
        role_id: adminRole.id,
        status: UserStatus.ACTIVE.value,
      },
    });
    const createdAuditor = await prisma.user.create({
      data: {
        first_name: 'John',
        last_name: 'Auditor',
        email: `e2e-me-auditor-${suffix}@example.com`,
        password_hash: await hasher.hash(auditorPassword),
        role_id: auditorRole.id,
        status: UserStatus.ACTIVE.value,
      },
    });
    usedUserIds.push(createdAdmin.id, createdAuditor.id);

    adminUser = {
      id: createdAdmin.id,
      email: createdAdmin.email,
      firstName: 'Jane',
      lastName: 'Admin',
    };
    auditorUser = {
      id: createdAuditor.id,
      email: createdAuditor.email,
      firstName: 'John',
      lastName: 'Auditor',
    };

    const electorPassword = 'SuperSecret123!';
    const elector = await prisma.elector.create({
      data: {
        first_name: 'Eve',
        last_name: 'Elector',
        email: `e2e-me-elector-${suffix}@correounivalle.edu.co`,
        password_hash: await hasher.hash(electorPassword),
        student_code: `E2EME-${suffix}`,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    usedStudentCodes.push(elector.student_code);
    activeElector = { id: elector.id, email: elector.email, password: electorPassword };

    adminToken = await completeAdminLogin(adminUser.email, adminPassword);
    auditorToken = await completeAdminLogin(auditorUser.email, auditorPassword);
    electorToken = await completeElectorLogin(activeElector.email, activeElector.password);
  });

  afterAll(async () => {
    if (usedStudentCodes.length > 0) {
      await prisma.elector.deleteMany({ where: { student_code: { in: usedStudentCodes } } });
    }
    await prisma.mfaChallenge.deleteMany({ where: { user_id: { in: usedUserIds } } });
    await prisma.auditLog.deleteMany({ where: { user_id: { in: usedUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: usedUserIds } } });
    await app.close();
  });

  describe('authorization and identity resolution', () => {
    it('M1: ADMIN token is accepted and returns the persisted user from the JWT', async () => {
      const res = await meGet(adminToken).expect(200);

      expect(res.body).toEqual({
        user: {
          id: adminUser.id,
          role: 'ADMINISTRATOR',
          name: 'Jane Admin',
          email: adminUser.email,
        },
      });
    });

    it('M2: AUDITOR token is accepted', async () => {
      const res = await meGet(auditorToken).expect(200);

      expect((res.body as MeResponse).user).toEqual({
        id: auditorUser.id,
        role: 'AUDITOR',
        name: 'John Auditor',
        email: auditorUser.email,
      });
    });

    it('M3: an ELECTOR token is rejected with 403', async () => {
      const res = await meGet(electorToken).expect(403);
      expect((res.body as ErrorBody).statusCode).toBe(403);
    });

    it('M4: a USER token with an unauthorized role is rejected with 403', async () => {
      const unauthorized = jwt.sign(
        { sub: adminUser.id, email: adminUser.email, actorType: 'USER', role: 'SOME_OTHER' },
        envs.jwtSecret,
        { expiresIn: envs.jwtExpiresIn },
      );
      const res = await meGet(unauthorized).expect(403);
      expect((res.body as ErrorBody).statusCode).toBe(403);
    });

    it('M5: a missing JWT is rejected with 401', async () => {
      const res = await meGet().expect(401);
      expect((res.body as ErrorBody).statusCode).toBe(401);
    });

    it('M6: an invalid JWT is rejected with 401', async () => {
      const res = await meGet(`${adminToken.slice(0, -2)}xx`).expect(401);
      expect((res.body as ErrorBody).statusCode).toBe(401);
    });

    it('M7: an expired JWT is rejected with 401', async () => {
      const expired = jwt.sign(
        { sub: adminUser.id, email: adminUser.email, actorType: 'USER', role: 'ADMINISTRATOR' },
        envs.jwtSecret,
        { expiresIn: -60 },
      );
      const res = await meGet(expired).expect(401);
      expect((res.body as ErrorBody).statusCode).toBe(401);
    });

    it('M8: query params cannot override the authenticated identity', async () => {
      const res = await meGet(adminToken, {}).query({ id: auditorUser.id }).expect(200);
      expect((res.body as MeResponse).user.id).toBe(adminUser.id);
    });

    it('M9: malicious headers cannot override the authenticated identity', async () => {
      const res = await meGet(adminToken, {
        'x-user-id': auditorUser.id,
        'x-email': auditorUser.email,
        'x-role': 'AUDITOR',
      }).expect(200);
      expect((res.body as MeResponse).user).toEqual({
        id: adminUser.id,
        role: 'ADMINISTRATOR',
        name: 'Jane Admin',
        email: adminUser.email,
      });
    });

    it('M10: a valid sub with no persisted record returns 404', async () => {
      const orphan = jwt.sign(
        {
          sub: crypto.randomUUID(),
          email: 'nobody@example.com',
          actorType: 'USER',
          role: 'AUDITOR',
        },
        envs.jwtSecret,
        { expiresIn: envs.jwtExpiresIn },
      );
      const res = await meGet(orphan).expect(404);
      expect((res.body as ErrorBody).statusCode).toBe(404);
    });

    it('M11: the response does not leak secrets or token contents', async () => {
      const res = await meGet(adminToken).expect(200);
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain('password');
      expect(bodyStr).not.toContain(envs.jwtSecret);
      expect(bodyStr).not.toContain(adminToken);
      expect(Object.keys(res.body as MeResponse)).toEqual(['user']);
      expect(Object.keys((res.body as MeResponse).user).sort()).toEqual([
        'email',
        'id',
        'name',
        'role',
      ]);
    });
  });

  describe('regression: existing protected endpoints unchanged', () => {
    it('R1: `/users/me` is not captured by the `/users/:id` route (no conflict)', async () => {
      const res = await meGet(adminToken).expect(200);
      expect(res.body as MeResponse).toHaveProperty('user');
    });

    it('R2: `GET /users/:id` still resolves a concrete user by id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect((res.body as { id: string }).id).toBe(adminUser.id);
    });

    it('R3: an ELECTOR token still cannot list users', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${electorToken}`)
        .expect(403);
    });
  });
});
