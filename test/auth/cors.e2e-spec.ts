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
import { extractAuthCookie } from './auth-cookie.utils';

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

describe('CORS (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let emailService: FakeEmailService;

  let adminUser: { id: string; email: string; password: string };

  const allowedOrigin = envs.corsOrigins[0];
  const disallowedOrigin = 'http://evil.example.com';

  const suffix = Date.now();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ASYNC_EMAIL_SERVICE_PORT)
      .useValue(new FakeEmailService())
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.enableCors({ origin: envs.corsOrigins, credentials: true });
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
    const role = await prisma.role.upsert({
      where: { name: RoleName.ADMINISTRATOR.value },
      update: {},
      create: { name: RoleName.ADMINISTRATOR.value },
    });
    const admin = await prisma.user.create({
      data: {
        first_name: 'E2E',
        last_name: 'CorsAdmin',
        email: `e2e-cors-${suffix}@example.com`,
        password_hash: await hasher.hash('SuperSecret123!'),
        role_id: role.id,
        status: UserStatus.ACTIVE.value,
      },
    });
    adminUser = { id: admin.id, email: admin.email, password: 'SuperSecret123!' };
  });

  afterAll(async () => {
    await prisma.mfaChallenge.deleteMany({ where: { user_id: adminUser.id } });
    await prisma.auditLog.deleteMany({ where: { user_id: adminUser.id } });
    await prisma.user.delete({ where: { id: adminUser.id } });
    await app.close();
  });

  it('CO1: an allowed origin receives credentialed CORS headers', async () => {
    const res = await request(app.getHttpServer())
      .get('/')
      .set('Origin', allowedOrigin)
      .expect(404); // no root route; CORS middleware still decorates the response

    expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('CO2: a disallowed origin is blocked (no allow-origin header)', async () => {
    const res = await request(app.getHttpServer())
      .get('/')
      .set('Origin', disallowedOrigin)
      .expect(404);

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('CO3: credentialed CORS never uses a wildcard origin', async () => {
    const res = await request(app.getHttpServer())
      .get('/')
      .set('Origin', allowedOrigin)
      .expect(404);

    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('CO4: preflight (OPTIONS) is answered with the allowed origin and methods', async () => {
    const res = await request(app.getHttpServer())
      .options('/')
      .set('Origin', allowedOrigin)
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);

    expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['access-control-allow-methods']).toContain('GET');
  });

  it('CO5: a credentialed authenticated request works', async () => {
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

    const res = await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Cookie', cookie)
      .set('Origin', allowedOrigin)
      .expect(200);

    expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });
});
