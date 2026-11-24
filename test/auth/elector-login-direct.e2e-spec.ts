import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { LoginElectorDirectUseCase } from '../../src/modules/auth/application/use-cases/login-elector-direct.use-case';
import {
  TOKEN_SERVICE_PORT,
  type TokenServicePort,
} from '../../src/modules/auth/application/ports/token-service.port';
import {
  ELECTOR_REPOSITORY,
  type ElectorRepository,
} from '../../src/modules/electors/domain/repositories/elector.repository.interface';
import {
  PASSWORD_HASHER_PORT,
  type PasswordHasherPort,
} from '../../src/modules/iam/application/ports/password-hasher.port';
import { NodeCryptoPasswordHasherService } from '../../src/modules/iam/infrastructure/services/node-crypto-password-hasher.service';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { GlobalExceptionFilter } from '../../src/shared/exceptions/filters/global-exception.filter';
import { extractAuthCookie } from './auth-cookie.utils';

const PASSWORD = 'DirectSecret123!';
const URL = '/api/v1/auth/electors/login-direct';

async function createApp(enabled: boolean): Promise<INestApplication<App>> {
  const moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(LoginElectorDirectUseCase)
    .useFactory({
      factory: (
        electors: ElectorRepository,
        hasher: PasswordHasherPort,
        tokens: TokenServicePort,
      ) => new LoginElectorDirectUseCase(electors, hasher, tokens, enabled),
      inject: [ELECTOR_REPOSITORY, PASSWORD_HASHER_PORT, TOKEN_SERVICE_PORT],
    })
    .compile();

  const app = moduleFixture.createNestApplication<INestApplication<App>>();
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.init();
  return app;
}

describe('Elector direct login (e2e)', () => {
  const hasher = new NodeCryptoPasswordHasherService();

  describe('flag enabled', () => {
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let electorId: string;
    let email: string;

    beforeAll(async () => {
      app = await createApp(true);
      prisma = app.get(PrismaService);
      const tag = randomUUID();
      email = `direct-voter-${tag}@correounivalle.edu.co`;
      const row = await prisma.elector.create({
        data: {
          first_name: 'Direct',
          last_name: 'Voter',
          email,
          password_hash: await hasher.hash(PASSWORD),
          student_code: `DIR-E2E-${tag}`,
          program_code: '2710',
          status: 'ACTIVE',
        },
      });
      electorId = row.id;
    });

    afterAll(async () => {
      await prisma.electorMfaChallenge.deleteMany({ where: { elector_id: electorId } });
      await prisma.elector.deleteMany({ where: { id: electorId } });
      await app.close();
    });

    it('E1: issues the auth cookie and allows GET /auth/electors/me', async () => {
      const res = await request(app.getHttpServer())
        .post(URL)
        .send({ email, password: PASSWORD })
        .expect(200);

      expect(typeof (res.body as { expiresIn: unknown }).expiresIn).toBe('number');
      expect(res.body).not.toHaveProperty('accessToken');
      const cookie = extractAuthCookie(res);

      await request(app.getHttpServer())
        .get('/api/v1/auth/electors/me')
        .set('Cookie', cookie)
        .expect(200);

      const challenges = await prisma.electorMfaChallenge.count({
        where: { elector_id: electorId },
      });
      expect(challenges).toBe(0);
    });

    it('E2: rejects a wrong password with 401', async () => {
      await request(app.getHttpServer())
        .post(URL)
        .send({ email, password: 'WrongSecret123!' })
        .expect(401);
    });
  });

  describe('flag disabled', () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
      app = await createApp(false);
    });

    afterAll(async () => {
      await app.close();
    });

    it('E3: responds 404', async () => {
      await request(app.getHttpServer())
        .post(URL)
        .send({ email: 'anyone@correounivalle.edu.co', password: PASSWORD })
        .expect(404);
    });
  });
});
