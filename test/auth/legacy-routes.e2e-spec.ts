import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as jwt from 'jsonwebtoken';
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

describe('Legacy auth routes removed (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let emailService: FakeEmailService;

  let activeElector: { id: string; email: string; password: string };
  let adminUser: { id: string; email: string; password: string };

  const suffix = Date.now();
  const usedStudentCodes: string[] = [];
  const usedUserIds: string[] = [];

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

    const activeCode = `E2ELEGACY-${suffix}`;
    const elector = await prisma.elector.create({
      data: {
        first_name: 'E2E',
        last_name: 'Legacy',
        email: `e2e-legacy-${suffix}@correounivalle.edu.co`,
        password_hash: await hasher.hash('SuperSecret123!'),
        student_code: activeCode,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    usedStudentCodes.push(activeCode);
    activeElector = { id: elector.id, email: elector.email, password: 'SuperSecret123!' };

    const adminRole = await prisma.role.upsert({
      where: { name: RoleName.ADMINISTRATOR.value },
      update: {},
      create: { name: RoleName.ADMINISTRATOR.value },
    });
    const admin = await prisma.user.create({
      data: {
        first_name: 'E2E',
        last_name: 'LegacyAdmin',
        email: `e2e-legacy-admin-${suffix}@example.com`,
        password_hash: await hasher.hash('SuperSecret123!'),
        role_id: adminRole.id,
        status: UserStatus.ACTIVE.value,
      },
    });
    usedUserIds.push(admin.id);
    adminUser = { id: admin.id, email: admin.email, password: 'SuperSecret123!' };
  });

  afterAll(async () => {
    if (usedStudentCodes.length > 0) {
      await prisma.elector.deleteMany({ where: { student_code: { in: usedStudentCodes } } });
    }
    await prisma.mfaChallenge.deleteMany({ where: { user_id: { in: usedUserIds } } });
    await prisma.electorMfaChallenge.deleteMany({
      where: { elector_id: { in: [activeElector.id] } },
    });
    await prisma.auditLog.deleteMany({ where: { user_id: { in: usedUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: usedUserIds } } });
    await app.close();
  });

  const electorToken = () =>
    jwt.sign(
      { sub: activeElector.id, email: activeElector.email, actorType: 'ELECTOR' },
      envs.jwtSecret,
      { expiresIn: envs.jwtExpiresIn },
    );

  const adminToken = () =>
    jwt.sign(
      { sub: adminUser.id, email: adminUser.email, actorType: 'USER', role: 'ADMINISTRATOR' },
      envs.jwtSecret,
      { expiresIn: envs.jwtExpiresIn },
    );

  describe('legacy paths return 404', () => {
    it('E4-01: POST /api/v1/electors/auth/login is removed', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/electors/auth/login')
        .send({ email: activeElector.email, password: activeElector.password })
        .expect(404);
    });

    it('E4-02: POST /api/v1/electors/auth/mfa/verify is removed', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/electors/auth/mfa/verify')
        .send({ sessionId: '00000000-0000-4000-8000-000000000000', code: '123456' })
        .expect(404);
    });

    it('E4-03: POST /api/v1/electors/auth/mfa/resend is removed', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/electors/auth/mfa/resend')
        .send({ sessionId: '00000000-0000-4000-8000-000000000000' })
        .expect(404);
    });

    it('E4-04: GET /api/v1/electors/me is removed', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/electors/me')
        .set('Authorization', `Bearer ${electorToken()}`)
        .expect(404);
    });

    it('E4-05: GET /api/v1/users/me is removed', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(404);
    });
  });

  describe('new auth paths are alive (migration, not deletion)', () => {
    it('E4-06: POST /api/v1/auth/electors/login returns 200', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/electors/login')
        .send({ email: activeElector.email, password: activeElector.password })
        .expect(200);

      expect(res.body).toMatchObject({ mfaRequired: true, expiresIn: 300 });
      expect(res.body).toHaveProperty('sessionId');
      expect(emailService.last().code).toMatch(/^\d{6}$/);
    });

    it('E4-07: GET /api/v1/auth/electors/me returns 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/electors/me')
        .set('Authorization', `Bearer ${electorToken()}`)
        .expect(200);

      expect(res.body).toMatchObject({
        user: { id: activeElector.id, role: 'ELECTOR', email: activeElector.email },
      });
    });

    it('E4-08: GET /api/v1/auth/me returns 200', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${adminToken()}`)
        .expect(200);

      expect(res.body).toMatchObject({
        user: { id: adminUser.id, role: 'ADMINISTRATOR', email: adminUser.email },
      });
    });
  });
});
