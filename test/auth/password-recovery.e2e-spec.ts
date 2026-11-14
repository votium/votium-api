import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import {
  ASYNC_EMAIL_SERVICE_PORT,
  type AsyncEmailServicePort,
} from '../../src/modules/auth/application/ports/async-email-service.port';
import {
  PASSWORD_RECOVERY_EMAIL_PORT,
  type PasswordRecoveryEmailPort,
} from '../../src/modules/auth/application/ports/password-recovery-email.port';
import { NodeCryptoPasswordHasherService } from '../../src/modules/iam/infrastructure/services/node-crypto-password-hasher.service';
import { GENERIC_PASSWORD_RECOVERY_MESSAGE } from '../../src/shared/constants/password-recovery.constants';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { GlobalExceptionFilter } from '../../src/shared/exceptions/filters/global-exception.filter';

class FakeRecoveryEmail implements PasswordRecoveryEmailPort {
  sent: Array<{ to: string; code: string }> = [];
  shouldFail = false;

  sendPasswordRecoveryCode(to: string, code: string): Promise<void> {
    this.sent.push({ to, code });
    if (this.shouldFail) return Promise.reject(new Error('smtp unavailable'));
    return Promise.resolve();
  }
}

// Login sends MFA codes through the async email port; silence it.
class SilentLoginEmail implements AsyncEmailServicePort {
  sendVerificationCode(): Promise<void> {
    return Promise.resolve();
  }
  queueVerificationCode(): Promise<void> {
    return Promise.resolve();
  }
}

const OLD_PASSWORD = 'OldSecret123!';
const NEW_PASSWORD = 'NewSecret456!';

describe('Password recovery (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const mail = new FakeRecoveryEmail();
  const hasher = new NodeCryptoPasswordHasherService();

  const userIds: string[] = [];
  const electorIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PASSWORD_RECOVERY_EMAIL_PORT)
      .useValue(mail)
      .overrideProvider(ASYNC_EMAIL_SERVICE_PORT)
      .useValue(new SilentLoginEmail())
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(() => {
    mail.sent = [];
    mail.shouldFail = false;
  });

  afterAll(async () => {
    await prisma.passwordRecoveryCode.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.electorPasswordRecoveryCode.deleteMany({
      where: { elector_id: { in: electorIds } },
    });
    await prisma.mfaChallenge.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.electorMfaChallenge.deleteMany({ where: { elector_id: { in: electorIds } } });
    await prisma.auditLog.deleteMany({ where: { user_id: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.elector.deleteMany({ where: { id: { in: electorIds } } });
    await app.close();
  });

  async function seedUser(): Promise<string> {
    const role = await prisma.role.upsert({
      where: { name: 'ADMINISTRATOR' },
      update: {},
      create: { name: 'ADMINISTRATOR' },
    });
    const email = `recovery-admin-${randomUUID()}@example.com`;
    const row = await prisma.user.create({
      data: {
        first_name: 'Recovery',
        last_name: 'Admin',
        email,
        password_hash: await hasher.hash(OLD_PASSWORD),
        role_id: role.id,
        status: 'ACTIVE',
      },
    });
    userIds.push(row.id);
    return email;
  }

  async function seedElector(): Promise<string> {
    const tag = randomUUID();
    const email = `recovery-voter-${tag}@correounivalle.edu.co`;
    const row = await prisma.elector.create({
      data: {
        first_name: 'Recovery',
        last_name: 'Voter',
        email,
        password_hash: await hasher.hash(OLD_PASSWORD),
        student_code: `REC-E2E-${tag}`,
        program_code: '2710',
        status: 'ACTIVE',
      },
    });
    electorIds.push(row.id);
    return email;
  }

  // Both portals share the same contract; only routes, seeding and tables differ.
  const contexts = [
    {
      name: 'administration portal',
      base: '/api/v1/auth',
      loginOk: 201,
      seed: seedUser,
      codes: (email: string) =>
        prisma.passwordRecoveryCode.findMany({ where: { user: { email } } }),
      ageCodes: (email: string) =>
        prisma.passwordRecoveryCode.updateMany({
          where: { user: { email } },
          data: { created_at: new Date(Date.now() - 120_000) },
        }),
      expireCodes: (email: string) =>
        prisma.passwordRecoveryCode.updateMany({
          where: { user: { email } },
          data: { expires_at: new Date(Date.now() - 1000) },
        }),
    },
    {
      name: 'elections portal',
      base: '/api/v1/auth/electors',
      loginOk: 200,
      seed: seedElector,
      codes: (email: string) =>
        prisma.electorPasswordRecoveryCode.findMany({ where: { elector: { email } } }),
      ageCodes: (email: string) =>
        prisma.electorPasswordRecoveryCode.updateMany({
          where: { elector: { email } },
          data: { created_at: new Date(Date.now() - 120_000) },
        }),
      expireCodes: (email: string) =>
        prisma.electorPasswordRecoveryCode.updateMany({
          where: { elector: { email } },
          data: { expires_at: new Date(Date.now() - 1000) },
        }),
    },
  ];

  describe.each(contexts)('$name', (ctx) => {
    const forgot = (email: string) =>
      request(app.getHttpServer()).post(`${ctx.base}/forgot-password`).send({ email });
    const reset = (email: string, code: string, newPassword = NEW_PASSWORD) =>
      request(app.getHttpServer())
        .post(`${ctx.base}/reset-password`)
        .send({ email, code, newPassword });
    const login = (email: string, password: string) =>
      request(app.getHttpServer()).post(`${ctx.base}/login`).send({ email, password });

    it('PR-01: forgot returns the generic 200 and emails a 6-digit code to an existing account', async () => {
      const email = await ctx.seed();

      const res = await forgot(email).expect(200);

      expect(res.body).toEqual({ message: GENERIC_PASSWORD_RECOVERY_MESSAGE });
      expect(mail.sent).toHaveLength(1);
      expect(mail.sent[0].to).toBe(email);
      expect(mail.sent[0].code).toMatch(/^\d{6}$/);
      expect(JSON.stringify(res.body)).not.toContain(mail.sent[0].code);
      const [stored] = await ctx.codes(email);
      expect(stored.code_hash).not.toBe(mail.sent[0].code);
    });

    it('PR-02: forgot answers the same for an unknown email and sends nothing', async () => {
      const res = await forgot(`nobody-${randomUUID()}@example.com`).expect(200);

      expect(res.body).toEqual({ message: GENERIC_PASSWORD_RECOVERY_MESSAGE });
      expect(mail.sent).toHaveLength(0);
    });

    it('PR-03: reset with the emailed code updates the password (old one stops working)', async () => {
      const email = await ctx.seed();
      await forgot(email).expect(200);

      const res = await reset(email, mail.sent[0].code).expect(200);

      expect(res.body).toEqual({ message: 'Password updated successfully.' });
      await login(email, NEW_PASSWORD).expect(ctx.loginOk);
      await login(email, OLD_PASSWORD).expect(401);
    });

    it('PR-04: reusing a code returns 409 RECOVERY_CODE_ALREADY_USED', async () => {
      const email = await ctx.seed();
      await forgot(email).expect(200);
      await reset(email, mail.sent[0].code).expect(200);

      const res = await reset(email, mail.sent[0].code, 'Another789!').expect(409);

      expect(JSON.stringify(res.body)).toContain('RECOVERY_CODE_ALREADY_USED');
    });

    it('PR-05: an expired code returns 410 RECOVERY_CODE_EXPIRED', async () => {
      const email = await ctx.seed();
      await forgot(email).expect(200);
      await ctx.expireCodes(email);

      const res = await reset(email, mail.sent[0].code).expect(410);

      expect(JSON.stringify(res.body)).toContain('RECOVERY_CODE_EXPIRED');
    });

    it('PR-06: a wrong code returns 400 RECOVERY_CODE_INVALID', async () => {
      const email = await ctx.seed();
      await forgot(email).expect(200);
      const wrong = mail.sent[0].code === '000000' ? '111111' : '000000';

      const res = await reset(email, wrong).expect(400);

      expect(JSON.stringify(res.body)).toContain('RECOVERY_CODE_INVALID');
    });

    it.each([
      ['a weak password', { code: '123456', newPassword: 'weak' }],
      ['a non-numeric code', { code: 'abcdef', newPassword: NEW_PASSWORD }],
      ['a short code', { code: '123', newPassword: NEW_PASSWORD }],
    ])('PR-07: rejects %s with 400 validation', async (_l, body) => {
      await request(app.getHttpServer())
        .post(`${ctx.base}/reset-password`)
        .send({ email: 'person@example.com', ...body })
        .expect(400);
    });

    it('PR-08: when the email fails, answers 200 and leaves no usable code', async () => {
      const email = await ctx.seed();
      mail.shouldFail = true;

      const res = await forgot(email).expect(200);

      expect(res.body).toEqual({ message: GENERIC_PASSWORD_RECOVERY_MESSAGE });
      expect(await ctx.codes(email)).toHaveLength(0);
      await reset(email, mail.sent[0].code).expect(400);
    });

    it('PR-09: a second forgot within 60 s sends nothing and the first code keeps working', async () => {
      const email = await ctx.seed();
      await forgot(email).expect(200);
      await forgot(email).expect(200);

      expect(mail.sent).toHaveLength(1);
      await reset(email, mail.sent[0].code).expect(200);
    });

    it('PR-10: a second forgot after the cooldown invalidates the first code', async () => {
      const email = await ctx.seed();
      await forgot(email).expect(200);
      await ctx.ageCodes(email);
      await forgot(email).expect(200);

      expect(mail.sent).toHaveLength(2);
      const [first, second] = mail.sent.map((m) => m.code);
      if (first !== second) {
        await reset(email, first).expect(400);
      }
      await reset(email, second).expect(200);
    });
  });

  it('PR-11: a code from one portal cannot reset an account in the other portal', async () => {
    const adminEmail = await seedUser();
    const voterEmail = await seedElector();

    await request(app.getHttpServer())
      .post('/api/v1/auth/forgot-password')
      .send({ email: adminEmail })
      .expect(200);
    const adminCode = mail.sent[0].code;

    // Same code sent to the voter portal (for a voter without any code) is invalid.
    await request(app.getHttpServer())
      .post('/api/v1/auth/electors/reset-password')
      .send({ email: voterEmail, code: adminCode, newPassword: NEW_PASSWORD })
      .expect(400);
    // The admin email is not a voter account: the voter portal rejects it too.
    await request(app.getHttpServer())
      .post('/api/v1/auth/electors/reset-password')
      .send({ email: adminEmail, code: adminCode, newPassword: NEW_PASSWORD })
      .expect(400);
  });
});
