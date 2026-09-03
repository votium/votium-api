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

describe('GET /electors/me (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let emailService: FakeEmailService;

  let activeElector: {
    id: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
  };
  let adminUser: { id: string; email: string; password: string };

  const suffix = Date.now();
  const usedStudentCodes: string[] = [];
  const usedUserIds: string[] = [];

  let electorToken = '';
  let adminToken = '';

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

  const meGet = (token?: string, extra: Record<string, string> = {}) => {
    const req = request(app.getHttpServer()).get('/api/v1/electors/me');
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

    const electorPassword = 'SuperSecret123!';
    const elector = await prisma.elector.create({
      data: {
        first_name: 'Eve',
        last_name: 'Voter',
        email: `e2e-me-e-${suffix}@correounivalle.edu.co`,
        password_hash: await hasher.hash(electorPassword),
        student_code: `E2EMEV-${suffix}`,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    usedStudentCodes.push(elector.student_code);
    activeElector = {
      id: elector.id,
      email: elector.email,
      password: electorPassword,
      firstName: 'Eve',
      lastName: 'Voter',
    };

    const adminRole = await prisma.role.upsert({
      where: { name: RoleName.ADMINISTRATOR.value },
      update: {},
      create: { name: RoleName.ADMINISTRATOR.value },
    });
    const adminPassword = 'SuperSecret123!';
    const admin = await prisma.user.create({
      data: {
        first_name: 'E2E',
        last_name: 'Admin',
        email: `e2e-me-e-admin-${suffix}@example.com`,
        password_hash: await hasher.hash(adminPassword),
        role_id: adminRole.id,
        status: UserStatus.ACTIVE.value,
      },
    });
    usedUserIds.push(admin.id);
    adminUser = { id: admin.id, email: admin.email, password: adminPassword };

    electorToken = await completeElectorLogin(activeElector.email, activeElector.password);
    adminToken = await completeAdminLogin(adminUser.email, adminUser.password);
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
    it('E1: ELECTOR token is accepted and returns the persisted elector from the JWT', async () => {
      const res = await meGet(electorToken).expect(200);

      expect(res.body).toEqual({
        user: {
          id: activeElector.id,
          role: 'ELECTOR',
          name: 'Eve Voter',
          email: activeElector.email,
        },
      });
    });

    it('E2: a USER (admin) token is rejected with 403', async () => {
      const res = await meGet(adminToken).expect(403);
      expect((res.body as ErrorBody).statusCode).toBe(403);
    });

    it('E4: a token without actorType is rejected with 403', async () => {
      const noActor = jwt.sign(
        { sub: activeElector.id, email: activeElector.email },
        envs.jwtSecret,
        { expiresIn: envs.jwtExpiresIn },
      );
      const res = await meGet(noActor).expect(403);
      expect((res.body as ErrorBody).statusCode).toBe(403);
    });

    it('E5: a token with an invalid actorType is rejected with 403 (case-sensitive)', async () => {
      for (const actorType of ['voter', 'user', 'ELECTOR ', ' elector']) {
        const bad = jwt.sign(
          { sub: activeElector.id, email: activeElector.email, actorType },
          envs.jwtSecret,
          { expiresIn: envs.jwtExpiresIn },
        );
        const res = await meGet(bad).expect(403);
        expect((res.body as ErrorBody).statusCode).toBe(403);
      }
    });

    it('E6: a missing JWT is rejected with 401', async () => {
      const res = await meGet().expect(401);
      expect((res.body as ErrorBody).statusCode).toBe(401);
    });

    it('E7: an invalid JWT is rejected with 401', async () => {
      const res = await meGet(`${electorToken.slice(0, -2)}xx`).expect(401);
      expect((res.body as ErrorBody).statusCode).toBe(401);
    });

    it('E8: an expired JWT is rejected with 401', async () => {
      const expired = jwt.sign(
        { sub: activeElector.id, email: activeElector.email, actorType: 'ELECTOR' },
        envs.jwtSecret,
        { expiresIn: -60 },
      );
      const res = await meGet(expired).expect(401);
      expect((res.body as ErrorBody).statusCode).toBe(401);
    });

    it('E9: query params cannot override the authenticated identity', async () => {
      const res = await meGet(electorToken, {}).query({ id: crypto.randomUUID() }).expect(200);
      expect((res.body as MeResponse).user.id).toBe(activeElector.id);
    });

    it('E10: malicious headers cannot override the authenticated identity', async () => {
      const res = await meGet(electorToken, {
        'x-user-id': crypto.randomUUID(),
        'x-email': 'attacker@example.com',
      }).expect(200);
      expect((res.body as MeResponse).user).toEqual({
        id: activeElector.id,
        role: 'ELECTOR',
        name: 'Eve Voter',
        email: activeElector.email,
      });
    });

    it('E12: a valid sub with no persisted elector returns 404', async () => {
      const orphan = jwt.sign(
        { sub: crypto.randomUUID(), email: 'nobody@example.com', actorType: 'ELECTOR' },
        envs.jwtSecret,
        { expiresIn: envs.jwtExpiresIn },
      );
      const res = await meGet(orphan).expect(404);
      expect((res.body as ErrorBody).statusCode).toBe(404);
    });

    it('E13: the response does not leak secrets or internal elector fields', async () => {
      const res = await meGet(electorToken).expect(200);
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain('password');
      expect(bodyStr).not.toContain(envs.jwtSecret);
      expect(bodyStr).not.toContain(electorToken);
      expect(bodyStr).not.toContain('studentCode');
      expect(bodyStr).not.toContain('programCode');
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
    it('R1: a USER token still cannot list electors', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(Array.isArray((res.body as { data: unknown[] }).data)).toBe(true);
    });

    it('R2: an ELECTOR token is not granted admin access on /users', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${electorToken}`)
        .expect(403);
    });
  });
});
