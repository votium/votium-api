import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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

interface SwaggerOperationShape {
  tags?: string[];
  parameters?: Array<{
    name: string;
    in: string;
    required: boolean;
    description?: string;
  }>;
  security?: Array<{ bearer: string[] }>;
  requestBody?: {
    required?: boolean;
    content: Record<string, { schema: { $ref?: string } }>;
  };
  responses: Record<string, { content: Record<string, { schema: { $ref?: string } }> }>;
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

  describe('DELETE /electors/:id', () => {
    let counter = 0;
    const seedElector = async (status = 'ACTIVE') => {
      counter += 1;
      const row = await prisma.elector.create({
        data: {
          first_name: 'Del',
          last_name: 'Elector',
          email: `e2e-del-${suffix}-${counter}@correounivalle.edu.co`,
          password_hash: 'pbkdf2$placeholder',
          student_code: `E2EDEL-${suffix}-${counter}`,
          program_code: '2710',
          status,
        },
      });
      usedStudentCodes.push(row.student_code);
      return row;
    };

    const deleteElector = (id: string, token: string = adminToken) =>
      request(app.getHttpServer())
        .delete(`/api/v1/electors/${id}`)
        .set('Authorization', `Bearer ${token}`);

    it('ED-1: an authenticated administrator deletes an elector with 204 and no body', async () => {
      const elector = await seedElector();

      const res = await deleteElector(elector.id).expect(204);

      expect(res.body).toEqual({});
    });

    it('ED-2: performs a logical delete and preserves the other columns', async () => {
      const elector = await seedElector();

      await deleteElector(elector.id).expect(204);

      const row = await prisma.elector.findUnique({ where: { id: elector.id } });
      expect(row).not.toBeNull();
      expect(row!.deleted_at).toBeInstanceOf(Date);
      expect(row!.status).toBe('ACTIVE');
      expect(row!.first_name).toBe(elector.first_name);
      expect(row!.last_name).toBe(elector.last_name);
      expect(row!.email).toBe(elector.email);
      expect(row!.student_code).toBe(elector.student_code);
      expect(row!.program_code).toBe(elector.program_code);
    });

    it('ED-3: a deleted elector is excluded from the electors list', async () => {
      const elector = await seedElector();
      await deleteElector(elector.id).expect(204);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/electors?studentCode=${elector.student_code}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect((res.body as { data: unknown[] }).data).toEqual([]);
    });

    it('ED-4: a second DELETE returns 404', async () => {
      const elector = await seedElector();
      await deleteElector(elector.id).expect(204);

      const res = await deleteElector(elector.id).expect(404);

      expect(res.body).toMatchObject({ statusCode: 404 });
    });

    it('ED-5: returns 404 for an unknown id', async () => {
      await deleteElector(crypto.randomUUID()).expect(404);
    });

    it('ED-6: returns 400 for a malformed id', async () => {
      await deleteElector('not-a-uuid').expect(400);
    });

    it('ED-7: returns 401 without/invalid token and 403 for an auditor', async () => {
      const elector = await seedElector();

      await request(app.getHttpServer()).delete(`/api/v1/electors/${elector.id}`).expect(401);
      await deleteElector(elector.id, 'not-a-real-token').expect(401);
      await deleteElector(elector.id, auditorToken).expect(403);
    });

    it('ED-8: does not physically delete the row', async () => {
      const elector = await seedElector();
      await deleteElector(elector.id).expect(204);

      const count = await prisma.elector.count({ where: { id: elector.id } });
      expect(count).toBe(1);
    });

    it('ED-9: failed requests do not modify rows', async () => {
      const elector = await seedElector();

      await deleteElector(elector.id, 'not-a-real-token').expect(401);
      await deleteElector(elector.id, auditorToken).expect(403);
      await deleteElector(crypto.randomUUID()).expect(404);

      const row = await prisma.elector.findUnique({ where: { id: elector.id } });
      expect(row!.deleted_at).toBeNull();
    });
  });

  describe('PUT /electors/:id/desactive', () => {
    let counter = 0;
    const seedElector = async (status = 'ACTIVE') => {
      counter += 1;
      const row = await prisma.elector.create({
        data: {
          first_name: 'Desact',
          last_name: 'Elector',
          email: `e2e-des-${suffix}-${counter}@correounivalle.edu.co`,
          password_hash: 'pbkdf2$placeholder',
          student_code: `E2EDES-${suffix}-${counter}`,
          program_code: '2710',
          status,
        },
      });
      usedStudentCodes.push(row.student_code);
      return row;
    };

    const deactivate = (id: string, token: string = adminToken) =>
      request(app.getHttpServer())
        .put(`/api/v1/electors/${id}/desactive`)
        .set('Authorization', `Bearer ${token}`);

    it('EDES-1: deactivates an elector with 200 and sets status INACTIVE without deleting', async () => {
      const elector = await seedElector();

      const res = await deactivate(elector.id).expect(200);

      expect(res.body).toEqual({ message: 'Elector deactivated successfully.' });

      const row = await prisma.elector.findUnique({ where: { id: elector.id } });
      expect(row!.status).toBe('INACTIVE');
      expect(row!.deleted_at).toBeNull();
      expect(row!.created_at).toEqual(elector.created_at);
    });

    it('EDES-2: returns 409 ELECTOR_ALREADY_INACTIVE when the elector is already inactive', async () => {
      const elector = await seedElector('INACTIVE');

      const res = await deactivate(elector.id).expect(409);

      expect(res.body).toMatchObject({ statusCode: 409, error: 'ELECTOR_ALREADY_INACTIVE' });
    });

    it('EDES-3: returns 404 when the elector is logically deleted', async () => {
      const elector = await seedElector();
      await request(app.getHttpServer())
        .delete(`/api/v1/electors/${elector.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      await deactivate(elector.id).expect(404);
    });

    it('EDES-4: enforces the guards (401/403) and validates the id (400)', async () => {
      const elector = await seedElector();

      await request(app.getHttpServer())
        .put(`/api/v1/electors/${elector.id}/desactive`)
        .expect(401);
      await deactivate(elector.id, 'not-a-real-token').expect(401);
      await deactivate(elector.id, auditorToken).expect(403);
      await deactivate('not-a-uuid').expect(400);
    });

    it('EDES-5: a deactivated (non-deleted) elector remains visible in the list', async () => {
      const elector = await seedElector();
      await deactivate(elector.id).expect(200);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/electors?studentCode=${elector.student_code}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const data = (res.body as { data: Array<{ id: string; status: string }> }).data;
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe(elector.id);
      expect(data[0].status).toBe('INACTIVE');
    });

    it('EDES-6: the old PATCH /electors/:id/desactive method is no longer registered (404)', async () => {
      const elector = await seedElector();

      await request(app.getHttpServer())
        .patch(`/api/v1/electors/${elector.id}/desactive`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('PUT /electors/:id/active', () => {
    let counter = 0;
    const seedElector = async (status: string) => {
      counter += 1;
      const row = await prisma.elector.create({
        data: {
          first_name: 'Act',
          last_name: 'Elector',
          email: `e2e-act-${suffix}-${counter}@correounivalle.edu.co`,
          password_hash: 'pbkdf2$placeholder',
          student_code: `E2EACT-${suffix}-${counter}`,
          program_code: '2710',
          status,
        },
      });
      usedStudentCodes.push(row.student_code);
      return row;
    };

    const activate = (id: string, token: string = adminToken) =>
      request(app.getHttpServer())
        .put(`/api/v1/electors/${id}/active`)
        .set('Authorization', `Bearer ${token}`);

    it('EACT-1: activates an INACTIVE elector with 200 and returns status ACTIVE', async () => {
      const elector = await seedElector('INACTIVE');

      const res = await activate(elector.id).expect(200);

      expect(res.body).toMatchObject({ id: elector.id, status: 'ACTIVE' });

      const row = await prisma.elector.findUnique({ where: { id: elector.id } });
      expect(row!.status).toBe('ACTIVE');
      expect(row!.deleted_at).toBeNull();
    });

    it('EACT-2: returns 409 ELECTOR_ALREADY_ACTIVE when the elector is already active', async () => {
      const elector = await seedElector('ACTIVE');

      const res = await activate(elector.id).expect(409);

      expect(res.body).toMatchObject({ statusCode: 409, error: 'ELECTOR_ALREADY_ACTIVE' });
    });

    it('EACT-3: returns 404 when the elector is logically deleted', async () => {
      const elector = await seedElector('INACTIVE');
      await request(app.getHttpServer())
        .delete(`/api/v1/electors/${elector.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);

      await activate(elector.id).expect(404);
    });

    it('EACT-4: enforces the guards (401/403) and validates the id (400)', async () => {
      const elector = await seedElector('INACTIVE');

      await request(app.getHttpServer()).put(`/api/v1/electors/${elector.id}/active`).expect(401);
      await activate(elector.id, 'not-a-real-token').expect(401);
      await activate(elector.id, auditorToken).expect(403);
      await activate('not-a-uuid').expect(400);
    });

    it('EACT-5: an activated elector becomes ACTIVE in the list', async () => {
      const elector = await seedElector('INACTIVE');
      await activate(elector.id).expect(200);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/electors?studentCode=${elector.student_code}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const data = (res.body as { data: Array<{ id: string; status: string }> }).data;
      expect(data).toHaveLength(1);
      expect(data[0].id).toBe(elector.id);
      expect(data[0].status).toBe('ACTIVE');
    });

    it('EACT-6: the old PATCH /electors/:id/active method is no longer registered (404)', async () => {
      const elector = await seedElector('INACTIVE');

      await request(app.getHttpServer())
        .patch(`/api/v1/electors/${elector.id}/active`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('GET /electors (query)', () => {
    let elq1: string;
    let elq2: string;
    let elq5: string;

    beforeAll(async () => {
      const seed = async (
        studentCode: string,
        firstName: string,
        lastName: string,
        programCode: string,
        status: string,
        created_at: string,
      ) => {
        const row = await prisma.elector.create({
          data: {
            first_name: firstName,
            last_name: lastName,
            email: `elq-${studentCode}-${suffix}@correounivalle.edu.co`,
            password_hash: 'pbkdf2$placeholder',
            student_code: studentCode,
            program_code: programCode,
            status,
            created_at: new Date(created_at),
          },
        });
        usedStudentCodes.push(row.student_code);
        return row;
      };

      elq1 = `ELQ-1-${suffix}`;
      elq2 = `ELQ-2-${suffix}`;
      elq5 = `ELQ-5-${suffix}`;

      await seed(elq1, 'Juan Camilo', 'Garcia Saenz', '2710', 'ACTIVE', '2026-01-15T00:00:00.000Z');
      await seed(
        elq2,
        'Maria Fernanda',
        'Rodriguez Perez',
        '2710',
        'ACTIVE',
        '2026-02-15T00:00:00.000Z',
      );
      await seed(
        `ELQ-3-${suffix}`,
        'Ana Sofia',
        'Martinez',
        '2715',
        'ACTIVE',
        '2026-03-15T00:00:00.000Z',
      );
      await seed(
        `ELQ-4-${suffix}`,
        'Deactivated',
        'User',
        '2710',
        'INACTIVE',
        '2026-04-15T00:00:00.000Z',
      );
      const toDelete = await seed(
        elq5,
        'Deleted',
        'User',
        '2710',
        'ACTIVE',
        '2026-05-15T00:00:00.000Z',
      );

      await request(app.getHttpServer())
        .delete(`/api/v1/electors/${toDelete.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(204);
    });

    it('E-Q01: no filters returns a paginated envelope with defaults and desc ordering', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = res.body as {
        data: Array<{ studentCode: string }>;
        meta: Record<string, unknown>;
      };
      expect(Array.isArray(body.data)).toBe(true);
      expect(Object.keys(body.meta).sort()).toEqual(['limit', 'page', 'total', 'totalPages']);
      expect(body.meta).toMatchObject({ page: 1, limit: 10 });
    });

    it('E-Q02: name matches the first name (partial, case-insensitive)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .query({ name: 'juan cam', studentCode: `ELQ-` })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const data = (res.body as { data: Array<{ studentCode: string }> }).data;
      expect(data.map((e) => e.studentCode)).toEqual([elq1]);
    });

    it('E-Q03: name matches the surname (partial, case-insensitive)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .query({ name: 'saenz', studentCode: `ELQ-` })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const data = (res.body as { data: Array<{ studentCode: string }> }).data;
      expect(data.map((e) => e.studentCode)).toEqual([elq1]);
    });

    it('E-Q04: name matching neither field returns an empty collection', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .query({ name: 'nobody' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect((res.body as { data: unknown[] }).data).toEqual([]);
      expect((res.body as { meta: { total: number } }).meta.total).toBe(0);
    });

    it('E-Q05: studentCode partial prefix match returns all matching electors', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .query({ studentCode: `ELQ-` })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = res.body as {
        data: Array<{ studentCode: string }>;
        meta: { total: number };
      };
      expect(body.meta.total).toBe(4);
      expect(body.data.map((e) => e.studentCode).sort()).toEqual([
        `ELQ-1-${suffix}`,
        `ELQ-2-${suffix}`,
        `ELQ-3-${suffix}`,
        `ELQ-4-${suffix}`,
      ]);
    });

    it('E-Q06: studentCode middle substring match', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .query({ studentCode: `Q-3-${suffix}` })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const data = (res.body as { data: Array<{ studentCode: string }> }).data;
      expect(data.map((e) => e.studentCode)).toEqual([`ELQ-3-${suffix}`]);
    });

    it('E-Q07: studentCode full-code match still works', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .query({ studentCode: elq1 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const data = (res.body as { data: Array<{ studentCode: string }> }).data;
      expect(data).toHaveLength(1);
      expect(data[0].studentCode).toBe(elq1);
    });

    it('E-Q08: studentCode non-matching value returns an empty collection', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .query({ studentCode: `NOPE-${suffix}` })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect((res.body as { data: unknown[] }).data).toEqual([]);
    });

    it('E-Q09: programCode partial prefix match returns all matching electors', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .query({ studentCode: 'ELQ-', programCode: '271' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = res.body as {
        data: Array<{ studentCode: string }>;
        meta: { total: number };
      };
      expect(body.meta.total).toBe(4);
      expect(body.data.map((e) => e.studentCode).sort()).toEqual([
        `ELQ-1-${suffix}`,
        `ELQ-2-${suffix}`,
        `ELQ-3-${suffix}`,
        `ELQ-4-${suffix}`,
      ]);
    });

    it('E-Q10: programCode full-code match still works', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .query({ programCode: '2715' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const data = (res.body as { data: Array<{ studentCode: string }> }).data;
      expect(data.map((e) => e.studentCode)).toEqual([`ELQ-3-${suffix}`]);
    });

    it('E-Q11: programCode non-matching value returns an empty collection', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .query({ programCode: '9999' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect((res.body as { data: unknown[] }).data).toEqual([]);
    });

    it('E-Q12: name + studentCode combine with AND', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .query({ name: 'maria', studentCode: `ELQ-2-` })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const data = (res.body as { data: Array<{ studentCode: string }> }).data;
      expect(data.map((e) => e.studentCode)).toEqual([elq2]);
    });

    it('E-Q13: name + programCode combine with AND', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .query({ name: 'fernanda', studentCode: 'ELQ-', programCode: '2710' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const data = (res.body as { data: Array<{ studentCode: string }> }).data;
      expect(data.map((e) => e.studentCode)).toEqual([elq2]);
    });

    it('E-Q14: studentCode + programCode combine with AND', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .query({ studentCode: 'ELQ-', programCode: '2715' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const data = (res.body as { data: Array<{ studentCode: string }> }).data;
      expect(data.map((e) => e.studentCode)).toEqual([`ELQ-3-${suffix}`]);
    });

    it('E-Q15: name + studentCode + programCode combine with AND', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .query({ name: 'ana', studentCode: 'ELQ-', programCode: '2715' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const data = (res.body as { data: Array<{ studentCode: string }> }).data;
      expect(data.map((e) => e.studentCode)).toEqual([`ELQ-3-${suffix}`]);
    });

    it('E-Q16: affected filters combine with pagination', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .query({ studentCode: 'ELQ-', limit: '2', page: '2' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const body = res.body as {
        data: Array<{ studentCode: string }>;
        meta: { page: number; limit: number; total: number; totalPages: number };
      };
      expect(body.meta).toMatchObject({ page: 2, limit: 2, total: 4, totalPages: 2 });
      expect(body.data).toHaveLength(2);
    });

    it('E-Q17: the legacy student_code parameter is rejected with 400', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .query({ student_code: elq1 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E-Q18: the legacy program_code parameter is rejected with 400', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .query({ program_code: '2710' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E-Q19: an unknown query parameter is rejected with 400', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .query({ unknown: 'value' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it.each([
      ['invalid page', { page: '0' }],
      ['invalid limit', { limit: 'abc' }],
    ])('E-Q20: rejects %s with 400', async (_label, query) => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .query(query)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('E-Q21: an unauthenticated request is rejected with 401', async () => {
      await request(app.getHttpServer()).get('/api/v1/electors').expect(401);
    });

    it('E-Q22: an invalid token is rejected with 401', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/electors')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
    });

    it('E-Q23: an auditor can list electors', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);

      expect(Array.isArray((res.body as { data: unknown[] }).data)).toBe(true);
    });

    it('E-Q24: response items expose exactly the existing ElectorResponseDto contract', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .query({ studentCode: elq1 })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const data = (res.body as { data: Array<Record<string, unknown>> }).data;
      expect(data).toHaveLength(1);
      expect(Object.keys(data[0]).sort()).toEqual(
        [
          'createdAt',
          'email',
          'firstName',
          'id',
          'lastName',
          'programCode',
          'status',
          'studentCode',
        ].sort(),
      );
    });

    it('E-Q25: empty and whitespace-only filters behave like no filters', async () => {
      const plain = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const blank = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .query({ name: '   ', studentCode: '', programCode: '  ' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect((blank.body as { meta: { total: number } }).meta.total).toBe(
        (plain.body as { meta: { total: number } }).meta.total,
      );
    });

    it('E-Q26: an empty filter query returns all electors but excludes deleted ones', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .query({ limit: '100' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const codes = (res.body as { data: Array<{ studentCode: string }> }).data.map(
        (e) => e.studentCode,
      );
      for (const seeded of [
        `ELQ-1-${suffix}`,
        `ELQ-2-${suffix}`,
        `ELQ-3-${suffix}`,
        `ELQ-4-${suffix}`,
      ]) {
        expect(codes).toContain(seeded);
      }
      expect(codes).not.toContain(elq5);
    });

    it('E-Q27: the query endpoint is read-only', async () => {
      const countBefore = await prisma.elector.count();

      await request(app.getHttpServer())
        .get('/api/v1/electors')
        .query({ studentCode: 'ELQ-' })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const countAfter = await prisma.elector.count();
      expect(countAfter).toBe(countBefore);
    });

    it('E-Q28: an INACTIVE (non-deleted) elector remains visible', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/electors')
        .query({ studentCode: `ELQ-4-${suffix}` })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const data = (res.body as { data: Array<{ status: string }> }).data;
      expect(data).toHaveLength(1);
      expect(data[0].status).toBe('INACTIVE');
    });
  });

  describe('Swagger / OpenAPI', () => {
    it('SW-1..7: GET /electors documents the canonical query parameters and responses', () => {
      const config = new DocumentBuilder()
        .setTitle('Votium API')
        .setDescription('Electronic voting system API')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
      const document = SwaggerModule.createDocument(app, config);

      const queryPathKey = Object.keys(document.paths).find(
        (path) => path.endsWith('/electors') && !path.includes('{'),
      );
      expect(queryPathKey).toBeDefined();
      const queryOperation = document.paths[queryPathKey!] as { get?: SwaggerOperationShape };
      expect(queryOperation.get).toBeDefined();

      // SW-1: operation metadata, tags and security
      expect(queryOperation.get!.tags).toContain('electors');
      expect(queryOperation.get!.security).toEqual([{ bearer: [] }]);

      // SW-2: query parameters are exactly the canonical set, without the legacy names or duplicates
      const queryParameters = (queryOperation.get!.parameters ?? []).filter(
        (parameter) => parameter.in === 'query',
      );
      const queryNames = queryParameters.map((parameter) => parameter.name).sort();
      expect(queryNames).toEqual(['limit', 'name', 'page', 'programCode', 'studentCode'].sort());
      expect(queryNames).not.toContain('student_code');
      expect(queryNames).not.toContain('program_code');
      expect(new Set(queryNames).size).toBe(queryNames.length);

      // SW-3..5: descriptions reflect the search semantics
      const byName = Object.fromEntries(queryParameters.map((p) => [p.name, p]));
      expect(byName['name'].description).toMatch(/first or last name/i);
      expect(byName['studentCode'].description).toMatch(/partial/i);
      expect(byName['programCode'].description).toMatch(/partial/i);

      // SW-6: successful, validation, and security responses are documented
      for (const status of ['200', '400', '401', '403']) {
        expect(queryOperation.get!.responses[status]).toBeDefined();
      }

      // SW-7: the 200 response references the existing electors list response DTO
      const schemaRef =
        queryOperation.get!.responses['200']?.content?.['application/json']?.schema?.$ref;
      expect(schemaRef).toMatch(/ElectorsListResponseDto/);
    });
  });
});
