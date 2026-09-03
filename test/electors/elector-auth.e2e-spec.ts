import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { decode } from 'jsonwebtoken';
import { envs } from '../../src/config';
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

class FakeEmailService implements EmailServicePort {
  sent: Array<{ to: string; code: string }> = [];
  shouldFail = false;

  sendVerificationCode(to: string, code: string): Promise<void> {
    if (this.shouldFail) return Promise.reject(new Error('smtp unavailable'));
    this.sent.push({ to, code });
    return Promise.resolve();
  }

  last(): { to: string; code: string } {
    return this.sent[this.sent.length - 1];
  }
}

interface LoginResponseBody {
  mfaRequired: boolean;
  sessionId: string;
  expiresIn: number;
  message: string;
}

interface TokensResponseBody {
  accessToken: string;
  expiresIn: number;
}

interface JwtClaims {
  sub: string;
  email: string;
  actorType: string;
  role?: string;
  studentCode?: string;
  programCode?: string;
}

describe('Elector auth MFA (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let emailService: FakeEmailService;

  let activeElector: { id: string; email: string; password: string };
  let inactiveElector: { id: string; email: string; password: string };
  let adminUser: { id: string; email: string; password: string };

  const suffix = Date.now();
  const usedStudentCodes: string[] = [];

  const startLogin = async (email: string, password: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/electors/auth/login')
      .send({ email, password })
      .expect(200);
    const body = res.body as LoginResponseBody;
    return body.sessionId;
  };

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

    const activeCode = `E2EAUTHX-${suffix}`;
    const inactiveCode = `E2EAUTHIX-${suffix}`;
    usedStudentCodes.push(activeCode, inactiveCode);

    const createdActive = await prisma.elector.create({
      data: {
        first_name: 'E2E',
        last_name: 'Active',
        email: `e2e-auth-mfa-active-${suffix}@correounivalle.edu.co`,
        password_hash: await hasher.hash('SuperSecret123!'),
        student_code: activeCode,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    const createdInactive = await prisma.elector.create({
      data: {
        first_name: 'E2E',
        last_name: 'Inactive',
        email: `e2e-auth-mfa-inactive-${suffix}@correounivalle.edu.co`,
        password_hash: await hasher.hash('SuperSecret123!'),
        student_code: inactiveCode,
        program_code: '2710',
        status: 'INACTIVE',
      },
    });

    activeElector = {
      id: createdActive.id,
      email: createdActive.email,
      password: 'SuperSecret123!',
    };
    inactiveElector = {
      id: createdInactive.id,
      email: createdInactive.email,
      password: 'SuperSecret123!',
    };

    const role = await prisma.role.upsert({
      where: { name: RoleName.ADMINISTRATOR.value },
      update: {},
      create: { name: RoleName.ADMINISTRATOR.value },
    });
    adminUser = {
      id: '',
      email: `e2e-auth-mfa-admin-${suffix}@example.com`,
      password: 'SuperSecret123!',
    };
    const createdAdmin = await prisma.user.create({
      data: {
        first_name: 'E2E',
        last_name: 'Admin',
        email: adminUser.email,
        password_hash: await hasher.hash(adminUser.password),
        role_id: role.id,
        status: UserStatus.ACTIVE.value,
      },
    });
    adminUser.id = createdAdmin.id;
  });

  afterAll(async () => {
    if (usedStudentCodes.length > 0) {
      await prisma.elector.deleteMany({ where: { student_code: { in: usedStudentCodes } } });
    }
    if (adminUser?.id) {
      await prisma.mfaChallenge.deleteMany({ where: { user_id: adminUser.id } });
      await prisma.auditLog.deleteMany({ where: { user_id: adminUser.id } });
      await prisma.user.delete({ where: { id: adminUser.id } });
    }
    await app.close();
  });

  describe('POST /electors/auth/login', () => {
    it('E1: returns 200 with MFA required, sessionId and sends OTP (no token)', async () => {
      emailService.sent = [];

      const res = await request(app.getHttpServer())
        .post('/api/v1/electors/auth/login')
        .send({ email: activeElector.email, password: activeElector.password })
        .expect(200);

      const body = res.body as LoginResponseBody;
      expect(body).toMatchObject({
        mfaRequired: true,
        expiresIn: 300,
        message: 'A verification code has been sent to your registered email.',
      });
      expect(body.sessionId).toEqual(expect.any(String));
      expect(body).not.toHaveProperty('accessToken');

      expect(emailService.last().to).toBe(activeElector.email);
      expect(emailService.last().code).toMatch(/^\d{6}$/);
    });

    it('E2: returns 401 for unknown email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/electors/auth/login')
        .send({ email: `unknown-${suffix}@example.com`, password: 'anything' })
        .expect(401);

      expect(res.body).toMatchObject({ message: 'Invalid credentials.' });
    });

    it('E3: returns 401 for wrong password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/electors/auth/login')
        .send({ email: activeElector.email, password: 'WrongPass123!' })
        .expect(401);

      expect(res.body).toMatchObject({ message: 'Invalid credentials.' });
    });

    it('E4: returns 401 for inactive elector', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/electors/auth/login')
        .send({ email: inactiveElector.email, password: inactiveElector.password })
        .expect(401);

      expect(res.body).toMatchObject({ message: 'Invalid credentials.' });
    });

    it('E5: returns 400 for malformed body (missing email)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/electors/auth/login')
        .send({ password: 'test' })
        .expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E6: returns 400 for invalid email format', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/electors/auth/login')
        .send({ email: 'not-an-email', password: 'test' })
        .expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E7: returns 500 and removes the session when email cannot be sent', async () => {
      emailService.shouldFail = true;
      try {
        const res = await request(app.getHttpServer())
          .post('/api/v1/electors/auth/login')
          .send({ email: activeElector.email, password: activeElector.password })
          .expect(500);
        expect(res.body).toMatchObject({ message: 'Unable to send verification email.' });
      } finally {
        emailService.shouldFail = false;
      }

      const remaining = await prisma.electorMfaChallenge.count({
        where: { elector_id: activeElector.id },
      });
      expect(remaining).toBe(0);
    });
  });

  describe('POST /electors/auth/mfa/verify', () => {
    it('E8: completes auth with correct code and returns ELECTOR JWT without role', async () => {
      const sessionId = await startLogin(activeElector.email, activeElector.password);
      const code = emailService.last().code;

      const res = await request(app.getHttpServer())
        .post('/api/v1/electors/auth/mfa/verify')
        .send({ sessionId, code })
        .expect(201);

      const body = res.body as TokensResponseBody;
      expect(body.accessToken).toEqual(expect.any(String));
      expect(body.expiresIn).toBe(envs.jwtExpiresIn);

      const claims = decode(body.accessToken) as JwtClaims;
      expect(claims).toMatchObject({
        actorType: 'ELECTOR',
        sub: activeElector.id,
        email: activeElector.email,
      });
      expect(claims).not.toHaveProperty('role');
      expect(claims).not.toHaveProperty('studentCode');
      expect(claims).not.toHaveProperty('programCode');
    });

    it('E9: rejects an invalid code with 400', async () => {
      const sessionId = await startLogin(activeElector.email, activeElector.password);

      const res = await request(app.getHttpServer())
        .post('/api/v1/electors/auth/mfa/verify')
        .send({ sessionId, code: '000000' })
        .expect(400);

      expect(res.body).toMatchObject({ message: 'Invalid verification code.' });
    });

    it('E10: rejects an expired session with 410', async () => {
      const sessionId = await startLogin(activeElector.email, activeElector.password);
      await prisma.electorMfaChallenge.update({
        where: { session_id: sessionId },
        data: { expires_at: new Date(Date.now() - 1_000) },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/electors/auth/mfa/verify')
        .send({ sessionId, code: '123456' })
        .expect(410);

      expect(res.body).toMatchObject({ message: 'Verification code has expired.' });
    });

    it('E11: rejects an unknown session with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/electors/auth/mfa/verify')
        .send({ sessionId: '00000000-0000-4000-8000-000000000000', code: '123456' })
        .expect(401);

      expect(res.body).toMatchObject({ message: 'Authentication session is invalid.' });
    });

    it('E12: rejects a reused code with 400', async () => {
      const sessionId = await startLogin(activeElector.email, activeElector.password);
      const code = emailService.last().code;

      await request(app.getHttpServer())
        .post('/api/v1/electors/auth/mfa/verify')
        .send({ sessionId, code })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/v1/electors/auth/mfa/verify')
        .send({ sessionId, code })
        .expect(400);

      expect(res.body).toMatchObject({ message: 'Verification code has already been used.' });
    });

    it('E13: rejects a malformed code with 400', async () => {
      const sessionId = await startLogin(activeElector.email, activeElector.password);

      await request(app.getHttpServer())
        .post('/api/v1/electors/auth/mfa/verify')
        .send({ sessionId, code: 'abc' })
        .expect(400);
    });

    it('E14: ELECTOR token cannot access elector-management routes (ElectorGuard rejects)', async () => {
      const sessionId = await startLogin(activeElector.email, activeElector.password);
      const code = emailService.last().code;

      const verifyRes = await request(app.getHttpServer())
        .post('/api/v1/electors/auth/mfa/verify')
        .send({ sessionId, code })
        .expect(201);
      const token = (verifyRes.body as TokensResponseBody).accessToken;

      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(res.body).toMatchObject({ statusCode: 403 });
    });
  });

  describe('POST /electors/auth/mfa/resend', () => {
    it('E16: sends a new code and keeps the session valid', async () => {
      const sessionId = await startLogin(activeElector.email, activeElector.password);
      const previous = emailService.last().code;
      await prisma.electorMfaChallenge.update({
        where: { session_id: sessionId },
        data: { resend_at: new Date(Date.now() - 1_000) },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/electors/auth/mfa/resend')
        .send({ sessionId })
        .expect(201);

      expect(res.body).toMatchObject({ message: 'A new verification code has been sent.' });
      expect(emailService.last().to).toBe(activeElector.email);
      expect(emailService.last().code).toMatch(/^\d{6}$/);
      expect(emailService.last().code).not.toBe(previous);

      const code = emailService.last().code;
      await request(app.getHttpServer())
        .post('/api/v1/electors/auth/mfa/verify')
        .send({ sessionId, code })
        .expect(201);
    });

    it('E17: rejects resending before the cooldown with 429', async () => {
      const sessionId = await startLogin(activeElector.email, activeElector.password);

      const res = await request(app.getHttpServer())
        .post('/api/v1/electors/auth/mfa/resend')
        .send({ sessionId })
        .expect(429);

      expect(res.body).toMatchObject({
        message: 'Too many verification attempts. Please try again later.',
      });
    });

    it('E18: rejects resending for an unknown or consumed session with 401', async () => {
      const sessionId = await startLogin(activeElector.email, activeElector.password);
      const code = emailService.last().code;
      await request(app.getHttpServer())
        .post('/api/v1/electors/auth/mfa/verify')
        .send({ sessionId, code })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/v1/electors/auth/mfa/resend')
        .send({ sessionId })
        .expect(401);

      expect(res.body).toMatchObject({ message: 'Authentication session is invalid.' });
    });
  });

  describe('Regression', () => {
    it('E19: elector cannot access admin-protected endpoints (403)', async () => {
      const sessionId = await startLogin(activeElector.email, activeElector.password);
      const code = emailService.last().code;

      const verifyRes = await request(app.getHttpServer())
        .post('/api/v1/electors/auth/mfa/verify')
        .send({ sessionId, code })
        .expect(201);
      const token = (verifyRes.body as TokensResponseBody).accessToken;

      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(res.body).toMatchObject({ statusCode: 403 });
    });

    it('E20: no token is issued at login (sessionId only)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/electors/auth/login')
        .send({ email: activeElector.email, password: activeElector.password })
        .expect(200);

      expect(res.body).toMatchObject({ mfaRequired: true });
      expect(res.body).not.toHaveProperty('accessToken');
      expect(res.body).not.toHaveProperty('refreshToken');
    });

    it('E21: existing users MFA endpoints remain unaffected', async () => {
      emailService.sent = [];

      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: adminUser.email, password: adminUser.password })
        .expect(201);

      const loginBody = loginRes.body as LoginResponseBody;
      expect(loginBody).toMatchObject({
        mfaRequired: true,
        expiresIn: 300,
        message: 'A verification code has been sent to your registered email.',
      });

      const code = emailService.last().code;
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify')
        .send({ sessionId: loginBody.sessionId, code })
        .expect(201);
    });
  });
});
