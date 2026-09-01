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

interface JwtClaims {
  sub: string;
  email: string;
  actorType: string;
  role?: string;
  studentCode?: string;
  programCode?: string;
}

describe('Elector auth login (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let activeElector: { id: string; email: string; password: string };
  let inactiveElector: { id: string; email: string; password: string };

  const suffix = Date.now();
  const usedStudentCodes: string[] = [];

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

    const hasher = new NodeCryptoPasswordHasherService();

    const activeCode = `E2EAUTH-${suffix}`;
    const inactiveCode = `E2EAUTHI-${suffix}`;
    usedStudentCodes.push(activeCode, inactiveCode);

    const createdActive = await prisma.elector.create({
      data: {
        first_name: 'E2E',
        last_name: 'Active',
        email: `e2e-auth-active-${suffix}@correounivalle.edu.co`,
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
        email: `e2e-auth-inactive-${suffix}@correounivalle.edu.co`,
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
  });

  afterAll(async () => {
    if (usedStudentCodes.length > 0) {
      await prisma.elector.deleteMany({ where: { student_code: { in: usedStudentCodes } } });
    }
    await app.close();
  });

  describe('POST /electors/auth/login', () => {
    it('E1: returns 200 with accessToken and expiresIn on valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/electors/auth/login')
        .send({ email: activeElector.email, password: activeElector.password })
        .expect(200);

      const body = res.body as LoginResponseBody;
      expect(body.accessToken).toEqual(expect.any(String));
      expect(body.expiresIn).toBe(envs.jwtExpiresIn);
    });

    it('E2: JWT contains actorType ELECTOR, sub, email and no role/studentCode/programCode', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/electors/auth/login')
        .send({ email: activeElector.email, password: activeElector.password })
        .expect(200);

      const claims = decode((res.body as LoginResponseBody).accessToken) as JwtClaims;

      expect(claims).toMatchObject({
        actorType: 'ELECTOR',
        sub: activeElector.id,
        email: activeElector.email,
      });
      expect(claims).not.toHaveProperty('role');
      expect(claims).not.toHaveProperty('studentCode');
      expect(claims).not.toHaveProperty('programCode');
    });

    it('E3: returns 401 for unknown email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/electors/auth/login')
        .send({ email: `unknown-${suffix}@example.com`, password: 'anything' })
        .expect(401);

      expect(res.body).toMatchObject({ message: 'Invalid credentials.' });
    });

    it('E4: returns 401 for wrong password', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/electors/auth/login')
        .send({ email: activeElector.email, password: 'WrongPass123!' })
        .expect(401);

      expect(res.body).toMatchObject({ message: 'Invalid credentials.' });
    });

    it('E5: returns 401 for inactive elector', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/electors/auth/login')
        .send({ email: inactiveElector.email, password: inactiveElector.password })
        .expect(401);
    });

    it('E6: returns 400 for malformed body (missing email)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/electors/auth/login')
        .send({ password: 'test' })
        .expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E7: returns 400 for malformed body (invalid email format)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/electors/auth/login')
        .send({ email: 'not-an-email', password: 'test' })
        .expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E8: elector token is accepted by JwtAuthGuard on a protected route', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/electors/auth/login')
        .send({ email: activeElector.email, password: activeElector.password })
        .expect(200);

      const token = (login.body as LoginResponseBody).accessToken;

      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);

      expect(res.body).toMatchObject({ statusCode: 403 });
    });

    it('E9: elector token is rejected by JwtAuthGuard when tampered', async () => {
      const login = await request(app.getHttpServer())
        .post('/api/v1/electors/auth/login')
        .send({ email: activeElector.email, password: activeElector.password })
        .expect(200);

      const token = (login.body as LoginResponseBody).accessToken;
      const tampered = `${token.slice(0, -2)}xx`;

      await request(app.getHttpServer())
        .get('/api/v1/electors')
        .set('Authorization', `Bearer ${tampered}`)
        .expect(401);
    });
  });
});
