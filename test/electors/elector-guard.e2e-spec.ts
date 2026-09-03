import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  Controller,
  Get,
  UseGuards,
  Module,
} from '@nestjs/common';
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
import { JwtAuthGuard } from '../../src/modules/auth/presentation/guards/jwt-auth.guard';
import { ElectorGuard } from '../../src/modules/auth/presentation/guards/elector.guard';
import { NodeCryptoPasswordHasherService } from '../../src/modules/iam/infrastructure/services/node-crypto-password-hasher.service';
import { RoleName } from '../../src/modules/iam/domain/value-objects/role-name.vo';
import { UserStatus } from '../../src/modules/iam/domain/value-objects/user-status.vo';
import { envs } from '../../src/config';

/**
 * Test-only protected route. It is declared inside this e2e spec (never in src/)
 * so the full JwtAuthGuard -> ElectorGuard chain can be exercised without adding
 * a dummy endpoint to the production API.
 */
@Controller('guard-probe')
class GuardProbeController {
  @UseGuards(JwtAuthGuard, ElectorGuard)
  @Get('elector')
  probe() {
    return { ok: true };
  }
}

@Module({
  imports: [AuthModule],
  controllers: [GuardProbeController],
})
class GuardProbeModule {}

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
  accessToken: string;
  expiresIn: number;
}

interface VerifyLoginBody {
  sessionId: string;
}

interface VerifyResponseBody {
  accessToken: string;
}

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  timestamp: string;
  path: string;
}

describe('ElectorGuard (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let emailService: FakeEmailService;

  let activeElector: { id: string; email: string; password: string };
  let adminUser: { id: string; email: string; password: string };

  const suffix = Date.now();
  const usedStudentCodes: string[] = [];
  const usedUserIds: string[] = [];

  let electorToken = '';
  let userToken = '';

  const completeAdminLogin = async (): Promise<string> => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: adminUser.email, password: adminUser.password })
      .expect(201);

    const sessionId = (loginRes.body as VerifyLoginBody).sessionId;
    const code = emailService.last().code;

    const verifyRes = await request(app.getHttpServer())
      .post('/api/v1/auth/mfa/verify')
      .send({ sessionId, code })
      .expect(201);

    return (verifyRes.body as VerifyResponseBody).accessToken;
  };

  const probeGet = (token?: string, extraHeaders: Record<string, string> = {}) => {
    const req = request(app.getHttpServer()).get('/api/v1/guard-probe/elector');
    if (token) req.set('Authorization', `Bearer ${token}`);
    Object.entries(extraHeaders).forEach(([k, v]) => {
      req.set(k, v);
    });
    return req;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule, GuardProbeModule],
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

    // Active elector (real ELECTOR token).
    const activeCode = `E2EGUARD-${suffix}`;
    const elector = await prisma.elector.create({
      data: {
        first_name: 'E2E',
        last_name: 'Guard',
        email: `e2e-guard-${suffix}@correounivalle.edu.co`,
        password_hash: await hasher.hash('SuperSecret123!'),
        student_code: activeCode,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    usedStudentCodes.push(activeCode);
    activeElector = { id: elector.id, email: elector.email, password: 'SuperSecret123!' };

    // ADMIN user (real USER token).
    const adminRole = await prisma.role.upsert({
      where: { name: RoleName.ADMINISTRATOR.value },
      update: {},
      create: { name: RoleName.ADMINISTRATOR.value },
    });
    const admin = await prisma.user.create({
      data: {
        first_name: 'E2E',
        last_name: 'GuardAdmin',
        email: `e2e-guard-admin-${suffix}@example.com`,
        password_hash: await hasher.hash('SuperSecret123!'),
        role_id: adminRole.id,
        status: UserStatus.ACTIVE.value,
      },
    });
    usedUserIds.push(admin.id);
    adminUser = { id: admin.id, email: admin.email, password: 'SuperSecret123!' };

    const login = await request(app.getHttpServer())
      .post('/api/v1/electors/auth/login')
      .send({ email: activeElector.email, password: activeElector.password })
      .expect(200);
    electorToken = (login.body as LoginResponseBody).accessToken;

    userToken = await completeAdminLogin();
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

  describe('guard chain on /guard-probe/elector', () => {
    it('E1: accepts a valid ELECTOR token', async () => {
      const res = await probeGet(electorToken).expect(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('E2: rejects a valid USER (admin) token with 403', async () => {
      const res = await probeGet(userToken).expect(403);
      const body = res.body as ErrorBody;
      expect(body.statusCode).toBe(403);
      expect(body.message).not.toContain(electorToken);
      expect(body.message).not.toContain('ELECTOR');
    });

    it('E3: rejects a valid-signature token without actorType with 403', async () => {
      const noActorToken = jwt.sign(
        { sub: activeElector.id, email: activeElector.email },
        envs.jwtSecret,
        { expiresIn: envs.jwtExpiresIn },
      );
      const res = await probeGet(noActorToken).expect(403);
      expect(res.body).toMatchObject({ statusCode: 403 });
    });

    it('E4: rejects a missing token with 401', async () => {
      const res = await probeGet().expect(401);
      expect(res.body).toMatchObject({ statusCode: 401 });
    });

    it('E5: rejects a tampered token with 401', async () => {
      const tampered = `${electorToken.slice(0, -2)}xx`;
      const res = await probeGet(tampered).expect(401);
      expect(res.body).toMatchObject({ statusCode: 401 });
    });

    it('E6: rejects an expired token with 401', async () => {
      const expired = jwt.sign(
        { sub: activeElector.id, email: activeElector.email, actorType: 'ELECTOR' },
        envs.jwtSecret,
        { expiresIn: -60 }, // already expired
      );
      const res = await probeGet(expired).expect(401);
      expect(res.body).toMatchObject({ statusCode: 401 });
    });

    it('E7: a USER token cannot override actorType via body/query/headers', async () => {
      // Token is USER; client tries to smuggle actorType: ELECTOR in headers.
      // The elector-type probe has no body/query handler, so verify the header
      // cannot bypass: a USER token still yields 403.
      const res = await probeGet(userToken, { 'x-actor-type': 'ELECTOR' }).expect(403);
      expect(res.body).toMatchObject({ statusCode: 403 });
    });

    it('E8: never returns 500 or leaks token contents for rejected requests', async () => {
      const cases = [userToken, `${electorToken.slice(0, -2)}xx`];
      for (const token of cases) {
        const res = await probeGet(token);
        const body = res.body as ErrorBody;
        expect([401, 403]).toContain(res.status);
        expect(body.statusCode).not.toBe(500);
        const bodyStr = JSON.stringify(body);
        expect(bodyStr).not.toContain(electorToken);
        expect(bodyStr).not.toContain(envs.jwtSecret);
      }
    });
  });

  describe('regression: existing role-protected endpoints unchanged', () => {
    it('E9: ADMIN user can list users (200)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);
    });

    it('E10: an ELECTOR token is not treated as an ADMIN on /users (403)', async () => {
      // Elector has actorType ELECTOR and no role, so it must not gain admin access.
      // RolesGuard reads the missing role and throws ForbiddenException -> 403.
      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${electorToken}`)
        .expect(403);
      expect(res.body).toMatchObject({ statusCode: 403 });
    });

    it('E11: /electors (GET) still enforces role rules (elector token, no role -> 403)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .set('Authorization', `Bearer ${electorToken}`)
        .expect(403);
      expect(res.body).toMatchObject({ statusCode: 403 });
    });
  });
});
