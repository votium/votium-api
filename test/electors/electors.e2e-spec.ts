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

interface TokensResponseBody {
  accessToken: string;
}

interface ImportSummaryBody {
  message: string;
  processed: number;
  created: number;
  failed: number;
}

const VALID_CSV = [
  '202012345,Juan Camilo,Garcia Saenz,2710,juan.garcia@correounivalle.edu.co',
  '202012346,Maria Fernanda,Rodriguez Perez,2710,maria.rodriguez@correounivalle.edu.co',
].join('\n');

describe('Electors import (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let emailService: FakeEmailService;

  let adminUser: { id: string; email: string; password: string };
  let auditorUser: { id: string; email: string; password: string };

  const suffix = Date.now();
  const usedStudentCodes: string[] = [];

  let adminToken = '';
  let auditorToken = '';

  const completeLogin = async (email: string, password: string): Promise<string> => {
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

    return (verifyRes.body as TokensResponseBody).accessToken;
  };

  const upload = (csv: string, filename = 'registry.csv', token = adminToken) =>
    request(app.getHttpServer())
      .post('/api/v1/electors/import')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(csv, 'utf8'), { filename });

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
    const adminRole = await prisma.role.upsert({
      where: { name: RoleName.ADMINISTRATOR.value },
      update: {},
      create: { name: RoleName.ADMINISTRATOR.value },
    });
    const auditorRole = await prisma.role.upsert({
      where: { name: RoleName.AUDITOR.value },
      update: {},
      create: { name: RoleName.AUDITOR.value },
    });

    adminUser = {
      id: '',
      email: `e2e-elector-admin-${suffix}@example.com`,
      password: 'SuperSecret123!',
    };
    auditorUser = {
      id: '',
      email: `e2e-elector-auditor-${suffix}@example.com`,
      password: 'SuperSecret123!',
    };

    const createdAdmin = await prisma.user.create({
      data: {
        first_name: 'E2E',
        last_name: 'Admin',
        email: adminUser.email,
        password_hash: await hasher.hash(adminUser.password),
        role_id: adminRole.id,
        status: UserStatus.ACTIVE.value,
      },
    });
    const createdAuditor = await prisma.user.create({
      data: {
        first_name: 'E2E',
        last_name: 'Auditor',
        email: auditorUser.email,
        password_hash: await hasher.hash(auditorUser.password),
        role_id: auditorRole.id,
        status: UserStatus.ACTIVE.value,
      },
    });
    adminUser.id = createdAdmin.id;
    auditorUser.id = createdAuditor.id;

    adminToken = await completeLogin(adminUser.email, adminUser.password);
    auditorToken = await completeLogin(auditorUser.email, auditorUser.password);
  });

  afterAll(async () => {
    if (usedStudentCodes.length > 0) {
      await prisma.elector.deleteMany({ where: { student_code: { in: usedStudentCodes } } });
    }
    const ids = [adminUser.id, auditorUser.id];
    await prisma.mfaChallenge.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  describe('POST /electors/import', () => {
    it('E1: imports a valid CSV and returns the exact summary', async () => {
      const res = await upload(VALID_CSV).expect(200);

      expect(res.body).toEqual({
        message: 'Electoral registry imported successfully.',
        processed: 2,
        created: 2,
        failed: 0,
      });
      usedStudentCodes.push('202012345', '202012346');
    });

    it('E2-E4: persists rows with defaults and hashed passwords, not plaintext', async () => {
      const rows = await prisma.elector.findMany({
        where: { student_code: { in: ['202012345', '202012346'] } },
      });

      expect(rows).toHaveLength(2);

      const first = rows.find((row) => row.student_code === '202012345');
      expect(first).not.toBeNull();
      expect(first!.status).toBe('ACTIVE');
      expect(first!.id).toBeTruthy();
      expect(first!.created_at).toBeInstanceOf(Date);
      expect(first!.first_name).toBe('Juan Camilo');
      expect(first!.last_name).toBe('Garcia Saenz');
      expect(first!.email).toBe('juan.garcia@correounivalle.edu.co');
      expect(first!.program_code).toBe('2710');
      expect(first!.password_hash).toMatch(/^pbkdf2\$/);
      expect(first!.password_hash).not.toBe('JU202012345GA');
    });

    it('E5: counts only data rows when a header is present', async () => {
      const csv = [
        'student_code,first_name,last_name,program_code,email',
        '202012347,Carlos,Lopez,2711,carlos@correounivalle.edu.co',
        '202012348,Ana,Martinez,2711,ana.martinez@correounivalle.edu.co',
      ].join('\n');

      const res = await upload(csv).expect(200);

      expect(res.body).toEqual({
        message: 'Electoral registry imported successfully.',
        processed: 2,
        created: 2,
        failed: 0,
      });
      usedStudentCodes.push('202012347', '202012348');
    });

    it('E6: summary invariant created + failed === processed', async () => {
      const csv = [
        '202012349,Diana,Perez,2710,diana.perez@correounivalle.edu.co',
        '202012349,Diana,Perez,2710,diana.perez.dup@correounivalle.edu.co',
      ].join('\n');

      const res = await upload(csv).expect(200);
      const summary = res.body as ImportSummaryBody;

      expect(summary.created + summary.failed).toBe(summary.processed);
      expect(summary.created).toBe(1);
      expect(summary.failed).toBe(1);
      usedStudentCodes.push('202012349');
    });

    it('E7: counts an in-file duplicate student_code as failed', async () => {
      const csv = [
        '202012350,Felipe,Rojas,2710,felipe.rojas@correounivalle.edu.co',
        '202012351,Felipe,Rojas,2710,felipe.rojas.dup@correounivalle.edu.co',
      ].join('\n');

      const res = await upload(csv).expect(200);

      expect(res.body).toEqual({
        message: 'Electoral registry imported successfully.',
        processed: 2,
        created: 2,
        failed: 0,
      });
      usedStudentCodes.push('202012350', '202012351');

      const again = await upload(csv).expect(200);
      expect(again.body).toEqual({
        message: 'Electoral registry imported successfully.',
        processed: 2,
        created: 0,
        failed: 2,
      });
    });

    it('E8: counts an email already in the database as failed', async () => {
      const preexistingEmail = `preexisting-${suffix}@correounivalle.edu.co`;
      const preexisting = await prisma.elector.create({
        data: {
          first_name: 'Pre',
          last_name: 'Seed',
          email: preexistingEmail,
          password_hash: 'pbkdf2$placeholder',
          student_code: `PRESEED-${suffix}`,
          program_code: '2710',
          status: 'ACTIVE',
        },
      });
      usedStudentCodes.push(preexisting.student_code);

      const csv = `202012352,Pre,Seed,2710,${preexistingEmail}`;

      const res = await upload(csv).expect(200);

      expect(res.body).toEqual({
        message: 'Electoral registry imported successfully.',
        processed: 1,
        created: 0,
        failed: 1,
      });
      usedStudentCodes.push('202012352');
    });

    it('E9: rejects a missing file with 400', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/electors/import')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(res.body).toMatchObject({ message: 'CSV file is required.' });
    });

    it('E10: rejects a non-CSV extension with 400', async () => {
      const res = await upload(VALID_CSV, 'registry.txt').expect(400);

      expect(res.body).toMatchObject({ message: 'Only CSV files are supported.' });
    });

    it('E11: rejects a malformed CSV with 400', async () => {
      const malformed =
        '202012345,"Juan Camilo,Garcia Saenz,2710,juan.garcia@correounivalle.edu.co';

      const res = await upload(malformed).expect(400);

      expect(res.body).toMatchObject({ message: 'Invalid CSV format.' });
    });

    it('E12: rejects a wrong column count with 400', async () => {
      const res = await upload('202012345,Juan Camilo,Garcia Saenz,2710').expect(400);

      expect(res.body).toMatchObject({
        message: 'Each CSV row must contain exactly five columns.',
      });
    });

    it('E13: rejects an invalid program code with 400', async () => {
      const res = await upload(
        '202012345,Juan Camilo,Garcia Saenz,271,juan.garcia@correounivalle.edu.co',
      ).expect(400);

      expect(res.body).toMatchObject({
        message: 'Program code must contain exactly four digits.',
      });
    });

    it('E14: rejects an incomplete row with 400', async () => {
      const res = await upload('202012345,Juan Camilo,Garcia Saenz,2710,').expect(400);

      expect(res.body).toMatchObject({ message: 'CSV contains incomplete rows.' });
    });

    it('E15: rejects requests without a token with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/electors/import')
        .attach('file', Buffer.from(VALID_CSV, 'utf8'), { filename: 'registry.csv' })
        .expect(401);
    });

    it('E16: rejects an invalid token with 401', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/electors/import')
        .set('Authorization', 'Bearer not-a-real-token')
        .attach('file', Buffer.from(VALID_CSV, 'utf8'), { filename: 'registry.csv' })
        .expect(401);
    });

    it('E17: rejects a non-admin role with 403', async () => {
      const res = await upload(VALID_CSV, 'registry.csv', auditorToken).expect(403);

      expect(res.body).toMatchObject({ statusCode: 403 });
    });
  });
});
