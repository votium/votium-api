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

    it('E6: rejects the entire import when the file contains a duplicate student_code', async () => {
      const csv = [
        '202012349,Diana,Perez,2710,diana.perez@correounivalle.edu.co',
        '202012349,Diana,Perez,2710,diana.perez.dup@correounivalle.edu.co',
      ].join('\n');

      const res = await upload(csv).expect(409);

      expect(res.body).toMatchObject({ statusCode: 409, error: 'ELECTOR_CONFLICT' });

      const rows = await prisma.elector.findMany({
        where: { student_code: { in: ['202012349'] } },
      });
      expect(rows).toHaveLength(0);
      usedStudentCodes.push('202012349');
    });

    it('E7: rejects a re-upload of the same CSV with 409 and persists nothing', async () => {
      const csv = [
        '202012350,Felipe,Rojas,2710,felipe.rojas@correounivalle.edu.co',
        '202012351,Felipe,Rojas,2710,felipe.rojas.dup@correounivalle.edu.co',
      ].join('\n');

      const first = await upload(csv).expect(200);
      expect(first.body).toEqual({
        message: 'Electoral registry imported successfully.',
        processed: 2,
        created: 2,
        failed: 0,
      });
      usedStudentCodes.push('202012350', '202012351');

      const again = await upload(csv).expect(409);
      expect(again.body).toMatchObject({ statusCode: 409, error: 'ELECTOR_CONFLICT' });

      const rows = await prisma.elector.findMany({
        where: { student_code: { in: ['202012350', '202012351'] } },
      });
      expect(rows).toHaveLength(2);
    });

    it('E8: rejects a CSV whose email already exists in the database with 409', async () => {
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

      const res = await upload(csv).expect(409);
      expect(res.body).toMatchObject({ statusCode: 409, error: 'ELECTOR_CONFLICT' });

      const rows = await prisma.elector.findMany({
        where: { student_code: { in: ['202012352'] } },
      });
      expect(rows).toHaveLength(0);
      usedStudentCodes.push('202012352');
    });

    it('E18: rejects an in-file duplicate email with 409 and persists nothing', async () => {
      const sharedEmail = `shared-dup-${suffix}@correounivalle.edu.co`;
      const csv = [
        `202012360,Juan,Rojas,2710,${sharedEmail}`,
        `202012361,Ana,Rojas,2710,${sharedEmail}`,
      ].join('\n');

      const res = await upload(csv).expect(409);

      expect(res.body).toMatchObject({ statusCode: 409, error: 'ELECTOR_CONFLICT' });

      const rows = await prisma.elector.findMany({
        where: { student_code: { in: ['202012360', '202012361'] } },
      });
      expect(rows).toHaveLength(0);
      usedStudentCodes.push('202012360', '202012361');
    });

    it('E19: rejects a student_code already in the database and persists nothing', async () => {
      // Student codes in the CSV must be all-digits: the CSV parser treats a first row
      // whose first cell is non-numeric as a header row and skips it.
      const seedCode = `19${suffix}`;
      const seeded = await prisma.elector.create({
        data: {
          first_name: 'Seed',
          last_name: 'User',
          email: `seed-e19-${suffix}@correounivalle.edu.co`,
          password_hash: 'pbkdf2$placeholder',
          student_code: seedCode,
          program_code: '2710',
          status: 'ACTIVE',
        },
      });
      usedStudentCodes.push(seeded.student_code);

      const newCode = `20${suffix}`;
      const csv = [
        `${seedCode},Existing,User,2710,existing-e19-${suffix}@correounivalle.edu.co`,
        `${newCode},Brand,New,2710,brand-new-e19-${suffix}@correounivalle.edu.co`,
      ].join('\n');

      const res = await upload(csv).expect(409);

      expect(res.body).toMatchObject({ statusCode: 409, error: 'ELECTOR_CONFLICT' });

      const rows = await prisma.elector.findMany({
        where: { student_code: { in: [seedCode, newCode] } },
      });
      expect(rows).toHaveLength(1);
      usedStudentCodes.push(newCode);
    });

    it('E20: returns the standard error body on a rejected import', async () => {
      const sharedEmail = `standard-dup-${suffix}@correounivalle.edu.co`;
      const csv = [
        `202012362,Dupe,One,2710,${sharedEmail}`,
        `202012363,Dupe,Two,2710,${sharedEmail}`,
      ].join('\n');

      const res = await upload(csv).expect(409);

      const body = res.body as {
        statusCode: number;
        error: string;
        message: string;
        timestamp: string;
        path: string;
      };
      expect(body).toMatchObject({ statusCode: 409, error: 'ELECTOR_CONFLICT' });
      expect(body.message).toContain('duplicate');
      expect(typeof body.timestamp).toBe('string');
      expect(typeof body.path).toBe('string');
      usedStudentCodes.push('202012362', '202012363');
    });

    it('E21: rejects a file that mixes an in-file duplicate with a valid new row', async () => {
      const sharedEmail = `mix-dup-${suffix}@correounivalle.edu.co`;
      const csv = [
        `202012364,Mix,One,2710,${sharedEmail}`,
        `202012365,Mix,Two,2710,${sharedEmail}`,
        `202012366,Mix,Three,2710,mix-new-${suffix}@correounivalle.edu.co`,
      ].join('\n');

      const res = await upload(csv).expect(409);

      expect(res.body).toMatchObject({ statusCode: 409, error: 'ELECTOR_CONFLICT' });

      const rows = await prisma.elector.findMany({
        where: { student_code: { in: ['202012364', '202012365', '202012366'] } },
      });
      expect(rows).toHaveLength(0);
      usedStudentCodes.push('202012364', '202012365', '202012366');
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

  describe('DELETE /electors/:id (deactivate)', () => {
    let activeElector: { id: string; student_code: string; created_at: Date };
    let repeatElector: { id: string; student_code: string };
    let e7Elector: { id: string; student_code: string };

    const activeCode = `E2EDEL-${suffix}`;
    const repeatCode = `E2EDELR-${suffix}`;
    const e7Code = `E2EDEL7-${suffix}`;

    beforeAll(async () => {
      activeElector = await prisma.elector.create({
        data: {
          first_name: 'Deact',
          last_name: 'Active',
          email: `e2e-del-${suffix}@correounivalle.edu.co`,
          password_hash: 'pbkdf2$placeholder',
          student_code: activeCode,
          program_code: '2710',
          status: 'ACTIVE',
        },
      });
      usedStudentCodes.push(activeElector.student_code);

      repeatElector = await prisma.elector.create({
        data: {
          first_name: 'Deact',
          last_name: 'Repeat',
          email: `e2e-del-r-${suffix}@correounivalle.edu.co`,
          password_hash: 'pbkdf2$placeholder',
          student_code: repeatCode,
          program_code: '2710',
          status: 'ACTIVE',
        },
      });
      usedStudentCodes.push(repeatElector.student_code);

      e7Elector = await prisma.elector.create({
        data: {
          first_name: 'Deact',
          last_name: 'Count',
          email: `e2e-del-7-${suffix}@correounivalle.edu.co`,
          password_hash: 'pbkdf2$placeholder',
          student_code: e7Code,
          program_code: '2710',
          status: 'ACTIVE',
        },
      });
      usedStudentCodes.push(e7Elector.student_code);
    });

    it('E1: deactivates an active elector with 200 and preserves the record', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/electors/${activeElector.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toEqual({ message: 'Elector deactivated successfully.' });

      const row = await prisma.elector.findUnique({ where: { id: activeElector.id } });
      expect(row).not.toBeNull();
      expect(row?.id).toBe(activeElector.id);
      expect(row?.status).toBe('INACTIVE');
      expect(row?.created_at).toEqual(activeElector.created_at);
      expect(row?.first_name).toBe('Deact');
      expect(row?.last_name).toBe('Active');
      expect(row?.email).toBe(`e2e-del-${suffix}@correounivalle.edu.co`);
      expect(row?.password_hash).toBe('pbkdf2$placeholder');
      expect(row?.student_code).toBe(activeCode);
      expect(row?.program_code).toBe('2710');
    });

    it('E2: returns 404 for a nonexistent elector id', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/electors/${crypto.randomUUID()}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });

    it('E3: returns 400 for an invalid (non-UUID) elector id', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/electors/not-a-uuid')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);
    });

    it('E4: returns 401 without a token or with an invalid token', async () => {
      await request(app.getHttpServer()).delete(`/api/v1/electors/${activeElector.id}`).expect(401);

      await request(app.getHttpServer())
        .delete(`/api/v1/electors/${activeElector.id}`)
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
    });

    it('E5: returns 403 for an auditor', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/electors/${activeElector.id}`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(403);

      expect(res.body).toMatchObject({ statusCode: 403 });
    });

    it('E6: returns 200 then 409 when deactivating an already inactive elector', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/electors/${repeatElector.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const again = await request(app.getHttpServer())
        .delete(`/api/v1/electors/${repeatElector.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(409);

      expect(again.body).toMatchObject({ statusCode: 409, error: 'ELECTOR_ALREADY_INACTIVE' });
    });

    it('E7: does not physically delete the elector record', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/electors/${e7Elector.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toEqual({ message: 'Elector deactivated successfully.' });

      const count = await prisma.elector.count({
        where: { student_code: e7Elector.student_code },
      });
      expect(count).toBe(1);
    });
  });
});
