import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { GlobalExceptionFilter } from '../../src/shared/exceptions/filters/global-exception.filter';
import {
  ASYNC_EMAIL_SERVICE_PORT,
  type AsyncEmailServicePort,
} from '../../src/modules/auth/application/ports/async-email-service.port';
import { NodeCryptoPasswordHasherService } from '../../src/modules/iam/infrastructure/services/node-crypto-password-hasher.service';
import { RoleName } from '../../src/modules/iam/domain/value-objects/role-name.vo';
import { UserStatus } from '../../src/modules/iam/domain/value-objects/user-status.vo';
import { envs } from '../../src/config';
import { extractAuthCookie, getAuthCookieHeader, parseSetCookie } from './auth-cookie.utils';

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
  mfaRequired: boolean;
  sessionId: string;
  expiresIn: number;
  message: string;
}

interface LoginResult {
  cookie: string;
  jwt: string;
  setCookieHeader: string;
}

describe('POST /auth/logout (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let emailService: FakeEmailService;

  let adminUser: { id: string; email: string; password: string };
  let activeElector: { id: string; email: string; password: string };

  const suffix = Date.now();
  const usedStudentCodes: string[] = [];
  const usedUserIds: string[] = [];

  const logout = () => request(app.getHttpServer()).post('/api/v1/auth/logout');

  const completeUserLogin = async (): Promise<LoginResult> => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminUser.email, password: adminUser.password })
      .expect(201);

    const sessionId = (loginRes.body as LoginResponseBody).sessionId;
    const code = emailService.last().code;

    const verifyRes = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/verify')
      .send({ sessionId, code })
      .expect(201);

    const cookie = extractAuthCookie(verifyRes);
    return { cookie, jwt: cookie.split('=')[1], setCookieHeader: getAuthCookieHeader(verifyRes) };
  };

  const completeElectorLogin = async (): Promise<LoginResult> => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/electors/login')
      .send({ email: activeElector.email, password: activeElector.password })
      .expect(200);

    const sessionId = (loginRes.body as LoginResponseBody).sessionId;
    const code = emailService.last().code;

    const verifyRes = await request(app.getHttpServer())
      .post('/api/v1/auth/electors/mfa/verify')
      .send({ sessionId, code })
      .expect(201);

    const cookie = extractAuthCookie(verifyRes);
    return { cookie, jwt: cookie.split('=')[1], setCookieHeader: getAuthCookieHeader(verifyRes) };
  };

  const expectClearingCookie = (
    res: { headers: { 'set-cookie'?: string[] }; body: unknown },
    original?: Record<string, string | true>,
  ) => {
    const header = getAuthCookieHeader(res);
    expect(header.startsWith(`${envs.authCookieName}=;`)).toBe(true);

    const cleared = parseSetCookie(header);
    expect(cleared['Max-Age']).toBe('0');
    expect(cleared.HttpOnly).toBe(true);
    expect(cleared.Secure).toBe(true);
    expect(String(cleared.SameSite).toLowerCase()).toBe(envs.authCookieSameSite.toLowerCase());
    expect(cleared.Path).toBe('/');

    if (original) {
      expect(cleared.HttpOnly).toBe(original.HttpOnly);
      expect(cleared.Secure).toBe(original.Secure);
      expect(String(cleared.SameSite).toLowerCase()).toBe(String(original.SameSite).toLowerCase());
      expect(cleared.Path).toBe(original.Path);
    }
  };

  const expectResHasClearingCookie = (res: {
    headers: { 'set-cookie'?: string[] };
    body: unknown;
  }) => {
    expect(getAuthCookieHeader(res).startsWith(`${envs.authCookieName}=;`)).toBe(true);
  };

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

    // ADMIN user.
    const role = await prisma.role.upsert({
      where: { name: RoleName.ADMINISTRATOR.value },
      update: {},
      create: { name: RoleName.ADMINISTRATOR.value },
    });
    const admin = await prisma.user.create({
      data: {
        first_name: 'E2E',
        last_name: 'LogoutAdmin',
        email: `e2e-logout-admin-${suffix}@example.com`,
        password_hash: await hasher.hash('SuperSecret123!'),
        role_id: role.id,
        status: UserStatus.ACTIVE.value,
      },
    });
    usedUserIds.push(admin.id);
    adminUser = { id: admin.id, email: admin.email, password: 'SuperSecret123!' };

    // ACTIVE elector.
    const studentCode = `E2ELOGOUT-${suffix}`;
    const elector = await prisma.elector.create({
      data: {
        first_name: 'E2E',
        last_name: 'Logout',
        email: `e2e-logout-${suffix}@correounivalle.edu.co`,
        password_hash: await hasher.hash('SuperSecret123!'),
        student_code: studentCode,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    usedStudentCodes.push(studentCode);
    activeElector = { id: elector.id, email: elector.email, password: 'SuperSecret123!' };
  });

  afterAll(async () => {
    if (usedStudentCodes.length > 0) {
      await prisma.elector.deleteMany({ where: { student_code: { in: usedStudentCodes } } });
    }
    if (usedUserIds.length > 0) {
      await prisma.mfaChallenge.deleteMany({ where: { user_id: { in: usedUserIds } } });
      await prisma.auditLog.deleteMany({ where: { user_id: { in: usedUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: usedUserIds } } });
    }
    await app.close();
  });

  it('L1: user logout clears the cookie (200), matching the original attributes and never returning the JWT', async () => {
    const { jwt, setCookieHeader } = await completeUserLogin();
    const original = parseSetCookie(setCookieHeader);

    const res = await logout().expect(200);

    expect(res.body).toMatchObject({ message: 'Logged out successfully.' });
    expect(JSON.stringify(res.body)).not.toContain(jwt);
    expectClearingCookie(res, original);
  });

  it('L2: elector logout clears the cookie with the same attributes (200)', async () => {
    const { jwt, setCookieHeader } = await completeElectorLogin();
    const original = parseSetCookie(setCookieHeader);

    const res = await logout().expect(200);

    expect(res.body).toMatchObject({ message: 'Logged out successfully.' });
    expect(JSON.stringify(res.body)).not.toContain(jwt);
    expectClearingCookie(res, original);
  });

  it('L3: logout is idempotent when no cookie is present (200, still clears)', async () => {
    const res = await logout().expect(200);

    expect(res.body).toMatchObject({ message: 'Logged out successfully.' });
    expectResHasClearingCookie(res);
  });

  it('L4: a second logout call is also accepted (200)', async () => {
    await completeElectorLogin();

    await logout().expect(200);
    const res = await logout().expect(200);
    expect(res.body).toMatchObject({ message: 'Logged out successfully.' });
  });

  it('L5: after logout, a protected request without the cookie is rejected with 401', async () => {
    await completeUserLogin();
    await logout().expect(200);

    const res = await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
    expect(res.body).toMatchObject({ statusCode: 401 });
  });

  it('L6: logout never exposes the JWT or the secret in any response body', async () => {
    const user = await completeUserLogin();
    const userRes = await logout().expect(200);
    expect(JSON.stringify(userRes.body)).not.toContain(user.jwt);
    expect(JSON.stringify(userRes.body)).not.toContain(envs.jwtSecret);

    const elector = await completeElectorLogin();
    const electorRes = await logout().expect(200);
    expect(JSON.stringify(electorRes.body)).not.toContain(elector.jwt);
    expect(JSON.stringify(electorRes.body)).not.toContain(envs.jwtSecret);

    const second = await logout().expect(200);
    expect(JSON.stringify(second.body)).not.toContain(envs.jwtSecret);
  });
});
