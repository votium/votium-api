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

describe('Auth MFA (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let emailService: FakeEmailService;

  let adminUser: { id: string; email: string; password: string };
  let disabledUser: { id: string; email: string; password: string };

  const suffix = Date.now();

  const startLogin = async (email: string, password: string): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(201);
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
    const role = await prisma.role.upsert({
      where: { name: RoleName.ADMINISTRATOR.value },
      update: {},
      create: { name: RoleName.ADMINISTRATOR.value },
    });

    adminUser = { id: '', email: `e2e-admin-${suffix}@example.com`, password: 'SuperSecret123!' };
    disabledUser = {
      id: '',
      email: `e2e-disabled-${suffix}@example.com`,
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
    const createdDisabled = await prisma.user.create({
      data: {
        first_name: 'E2E',
        last_name: 'Disabled',
        email: disabledUser.email,
        password_hash: await hasher.hash(disabledUser.password),
        role_id: role.id,
        status: UserStatus.DISABLED.value,
      },
    });
    adminUser.id = createdAdmin.id;
    disabledUser.id = createdDisabled.id;
  });

  afterAll(async () => {
    const ids = [adminUser.id, disabledUser.id];
    await prisma.mfaChallenge.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  describe('POST /auth/login', () => {
    it('returns MFA required, a session id, and sends the OTP by email', async () => {
      emailService.sent = [];

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: adminUser.email, password: adminUser.password })
        .expect(201);

      const body = res.body as LoginResponseBody;
      expect(body).toMatchObject({
        mfaRequired: true,
        expiresIn: 300,
        message: 'A verification code has been sent to your registered email.',
      });
      expect(body.sessionId).toEqual(expect.any(String));

      const sent = emailService.last();
      expect(sent.to).toBe(adminUser.email);
      expect(sent.code).toMatch(/^\d{6}$/);
    });

    it('rejects invalid credentials with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: adminUser.email, password: 'wrong-password' })
        .expect(401);

      expect(res.body).toMatchObject({ message: 'Invalid credentials.' });
    });

    it('rejects a disabled user with 403', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: disabledUser.email, password: disabledUser.password })
        .expect(403);

      expect(res.body).toMatchObject({ message: 'User account is disabled.' });
    });

    it('rejects malformed input with 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'not-an-email', password: 123 })
        .expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('returns 500 and removes the session when the email cannot be sent', async () => {
      emailService.shouldFail = true;
      try {
        const res = await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: adminUser.email, password: adminUser.password })
          .expect(500);
        expect(res.body).toMatchObject({ message: 'Unable to send verification email.' });
      } finally {
        emailService.shouldFail = false;
      }

      const remaining = await prisma.mfaChallenge.count({
        where: { user_id: adminUser.id },
      });
      expect(remaining).toBe(0);
    });
  });

  describe('POST /auth/mfa/verify', () => {
    it('completes authentication with the correct code and issues tokens', async () => {
      const sessionId = await startLogin(adminUser.email, adminUser.password);
      const code = emailService.last().code;

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify')
        .send({ sessionId, code })
        .expect(201);

      const body = res.body as TokensResponseBody;
      expect(body.accessToken).toEqual(expect.any(String));
      expect(body.expiresIn).toBe(3600);

      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);
    });

    it('rejects an invalid code with 400', async () => {
      const sessionId = await startLogin(adminUser.email, adminUser.password);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify')
        .send({ sessionId, code: '000000' })
        .expect(400);

      expect(res.body).toMatchObject({ message: 'Invalid verification code.' });
    });

    it('rejects an expired session with 410', async () => {
      const sessionId = await startLogin(adminUser.email, adminUser.password);
      await prisma.mfaChallenge.update({
        where: { session_id: sessionId },
        data: { expires_at: new Date(Date.now() - 1_000) },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify')
        .send({ sessionId, code: '123456' })
        .expect(410);

      expect(res.body).toMatchObject({ message: 'Verification code has expired.' });
    });

    it('rejects an unknown session with 401', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify')
        .send({ sessionId: '00000000-0000-4000-8000-000000000000', code: '123456' })
        .expect(401);

      expect(res.body).toMatchObject({ message: 'Authentication session is invalid.' });
    });

    it('rejects a reused code with 400', async () => {
      const sessionId = await startLogin(adminUser.email, adminUser.password);
      const code = emailService.last().code;

      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify')
        .send({ sessionId, code })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify')
        .send({ sessionId, code })
        .expect(400);

      expect(res.body).toMatchObject({ message: 'Verification code has already been used.' });
    });

    it('rejects a malformed code with 400', async () => {
      const sessionId = await startLogin(adminUser.email, adminUser.password);

      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify')
        .send({ sessionId, code: 'abc' })
        .expect(400);
    });
  });

  describe('POST /auth/mfa/resend', () => {
    it('sends a new code and keeps the session valid', async () => {
      const sessionId = await startLogin(adminUser.email, adminUser.password);
      const previous = emailService.last().code;
      await prisma.mfaChallenge.update({
        where: { session_id: sessionId },
        data: { resend_at: new Date(Date.now() - 1_000) },
      });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/resend')
        .send({ sessionId })
        .expect(201);

      expect(res.body).toMatchObject({ message: 'A new verification code has been sent.' });
      expect(emailService.last().to).toBe(adminUser.email);
      expect(emailService.last().code).toMatch(/^\d{6}$/);
      expect(emailService.last().code).not.toBe(previous);

      const code = emailService.last().code;
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify')
        .send({ sessionId, code })
        .expect(201);
    });

    it('rejects resending before the cooldown with 429', async () => {
      const sessionId = await startLogin(adminUser.email, adminUser.password);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/resend')
        .send({ sessionId })
        .expect(429);

      expect(res.body).toMatchObject({
        message: 'Too many verification attempts. Please try again later.',
      });
    });

    it('rejects resending for an unknown or consumed session with 401', async () => {
      const sessionId = await startLogin(adminUser.email, adminUser.password);
      const code = emailService.last().code;
      await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/verify')
        .send({ sessionId, code })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/mfa/resend')
        .send({ sessionId })
        .expect(401);

      expect(res.body).toMatchObject({ message: 'Authentication session is invalid.' });
    });
  });
});
