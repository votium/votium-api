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

describe('Electors (e2e)', () => {
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

  describe('GET /electors (search)', () => {
    const searchFixtures = [
      {
        key: 'juan2710',
        studentCode: `E2ESRCH-1-${suffix}`,
        firstName: 'Juan Camilo',
        lastName: 'Garcia Saenz',
        programCode: '2710',
      },
      {
        key: 'juan2_2710',
        studentCode: `E2ESRCH-2-${suffix}`,
        firstName: 'JUAN Carlos',
        lastName: 'Perez Rojas',
        programCode: '2710',
      },
      {
        key: 'maria2711',
        studentCode: `E2ESRCH-3-${suffix}`,
        firstName: 'Maria Fernanda',
        lastName: 'GARCIA',
        programCode: '2711',
      },
      {
        key: 'ana2711',
        studentCode: `E2ESRCH-4-${suffix}`,
        firstName: 'Ana Sofia',
        lastName: 'Lopez',
        programCode: '2711',
      },
    ] as const;

    const searchCodes = searchFixtures.map((fixture) => fixture.studentCode);

    beforeAll(async () => {
      // The search suite is self-contained: clear previous elector data, then seed fixtures.
      await prisma.elector.deleteMany({});
      for (const fixture of searchFixtures) {
        await prisma.elector.create({
          data: {
            first_name: fixture.firstName,
            last_name: fixture.lastName,
            email: `${fixture.studentCode.toLowerCase()}@correounivalle.edu.co`,
            password_hash: 'pbkdf2$test',
            student_code: fixture.studentCode,
            program_code: fixture.programCode,
            status: 'ACTIVE',
          },
        });
        usedStudentCodes.push(fixture.studentCode);
      }
    });

    const search = (query: string, token: string = adminToken) =>
      request(app.getHttpServer())
        .get(`/api/v1/electors${query}`)
        .set('Authorization', `Bearer ${token}`);

    const codesOf = (body: ElectorSearchBody): string[] =>
      body.data.map((elector) => elector.studentCode);

    it('S1: search by program_code returns only matching electors (AC-02)', async () => {
      const res = await search('?program_code=2710').expect(200);
      const body = res.body as ElectorSearchBody;

      expect(body.meta.total).toBe(2);
      expect(body.data).toHaveLength(2);
      expect(body.data.every((elector) => elector.programCode === '2710')).toBe(true);
      expect(codesOf(body).sort()).toEqual([searchCodes[0], searchCodes[1]].sort());
    });

    it('S2: program_code matching is exact (AC-03)', async () => {
      const res = await search('?program_code=271').expect(200);
      const body = res.body as ElectorSearchBody;

      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });

    it('S3: search by student_code returns the matching elector (AC-04, AC-15)', async () => {
      const res = await search(`?student_code=${searchCodes[0]}`).expect(200);
      const body = res.body as ElectorSearchBody;

      expect(body.meta.total).toBe(1);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].studentCode).toBe(searchCodes[0]);
      expect(body.data[0].firstName).toBe('Juan Camilo');
      expect(body.data[0].programCode).toBe('2710');
    });

    it('S4: student_code matching is exact (AC-05)', async () => {
      const res = await search('?student_code=E2ESRCH-1').expect(200);
      const body = res.body as ElectorSearchBody;

      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });

    it('S5: search by first name (AC-06)', async () => {
      const res = await search('?name=juan').expect(200);
      const body = res.body as ElectorSearchBody;

      expect(codesOf(body).sort()).toEqual([searchCodes[0], searchCodes[1]].sort());
      expect(body.meta.total).toBe(2);
    });

    it('S6: search by last name (AC-07)', async () => {
      const res = await search('?name=garcia').expect(200);
      const body = res.body as ElectorSearchBody;

      expect(codesOf(body).sort()).toEqual([searchCodes[0], searchCodes[2]].sort());
      expect(body.meta.total).toBe(2);
    });

    it('S7: partial name matching (AC-08)', async () => {
      const res = await search('?name=juan').expect(200);
      const body = res.body as ElectorSearchBody;

      expect(codesOf(body)).toContain(searchCodes[0]); // first_name = 'Juan Camilo'
    });

    it('S8: name matching is case-insensitive (AC-09)', async () => {
      const variants = ['juan', 'Juan', 'JUAN', 'jUaN'];
      const resultSets: string[][] = [];

      for (const name of variants) {
        const res = await search(`?name=${name}`).expect(200);
        resultSets.push(codesOf(res.body as ElectorSearchBody).sort());
      }

      for (const set of resultSets) {
        expect(set).toEqual(resultSets[0]);
      }
      expect(resultSets[0]).toHaveLength(2);
    });

    it('S9: combined program_code and name filters use AND (AC-10)', async () => {
      const res = await search('?program_code=2710&name=juan').expect(200);
      const body = res.body as ElectorSearchBody;

      expect(codesOf(body).sort()).toEqual([searchCodes[0], searchCodes[1]].sort());
      expect(body.meta.total).toBe(2);
    });

    it('S10: combined program_code and student_code filters use AND (AC-11)', async () => {
      const res = await search(`?program_code=2710&student_code=${searchCodes[1]}`).expect(200);
      const body = res.body as ElectorSearchBody;

      expect(codesOf(body)).toEqual([searchCodes[1]]);
      expect(body.meta.total).toBe(1);
    });

    it('S11: an elector matching only one filter is excluded (AC-12)', async () => {
      const res = await search('?program_code=2710&name=lopez').expect(200);
      const body = res.body as ElectorSearchBody;

      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });

    it('S12: a nonexistent filter returns an empty collection (AC-14)', async () => {
      const res = await search('?program_code=9999').expect(200);
      const body = res.body as ElectorSearchBody;

      expect(body.data).toEqual([]);
      expect(body.meta.total).toBe(0);
    });

    it('S13: password_hash is never exposed (AC-16)', async () => {
      const res = await search('?program_code=2710').expect(200);
      const serialized = JSON.stringify(res.body);

      expect(serialized).not.toContain('password_hash');
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('pbkdf2$test');
    });

    it('S14: electoralRolls relation is not returned (AC-17)', async () => {
      const res = await search('?program_code=2710').expect(200);

      expect(JSON.stringify(res.body)).not.toContain('electoralRolls');
    });

    it('S15: unauthenticated requests are rejected (AC-20)', async () => {
      await request(app.getHttpServer()).get('/api/v1/electors').expect(401);

      await request(app.getHttpServer())
        .get('/api/v1/electors')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(401);
    });

    it('S16: an authenticated auditor can search electors (BR-13)', async () => {
      const res = await search('?program_code=2710', auditorToken).expect(200);

      expect((res.body as ElectorSearchBody).meta.total).toBe(2);
    });

    it('S17: search requests do not modify elector records (AC-18)', async () => {
      const before = await prisma.elector.findMany({
        where: { student_code: { in: searchCodes } },
        orderBy: { student_code: 'asc' },
      });

      await search('?program_code=2710&name=juan').expect(200);

      const after = await prisma.elector.findMany({
        where: { student_code: { in: searchCodes } },
        orderBy: { student_code: 'asc' },
      });

      expect(after).toEqual(before);
    });

    it('S18: an unknown query parameter is rejected with 400 (validation)', async () => {
      const res = await search('?foo=bar').expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });

    it('S19: malformed page/limit values are rejected with 400 (validation)', async () => {
      await search('?page=abc').expect(400);

      await search('?limit=0').expect(400);
    });
  });
});
