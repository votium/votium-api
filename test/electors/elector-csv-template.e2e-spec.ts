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
import { buildAuthCookie, extractAuthCookie } from '../auth/auth-cookie.utils';

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

describe('Elector CSV template download (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let emailService: FakeEmailService;

  let adminUser: { id: string; email: string; password: string };
  let auditorUser: { id: string; email: string; password: string };

  const suffix = Date.now();
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

    return extractAuthCookie(verifyRes);
  };

  const download = (token?: string) => {
    const req = request(app.getHttpServer()).get('/api/v1/electors/template/csv');
    return token ? req.set('Cookie', token) : req;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ASYNC_EMAIL_SERVICE_PORT)
      .useValue(new FakeEmailService())
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
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
      email: `e2e-template-admin-${suffix}@example.com`,
      password: 'SuperSecret123!',
    };
    auditorUser = {
      id: '',
      email: `e2e-template-auditor-${suffix}@example.com`,
      password: 'SuperSecret123!',
    };

    const createdAdmin = await prisma.user.create({
      data: {
        first_name: 'E2E',
        last_name: 'TemplateAdmin',
        email: adminUser.email,
        password_hash: await hasher.hash(adminUser.password),
        role_id: adminRole.id,
        status: UserStatus.ACTIVE.value,
      },
    });
    const createdAuditor = await prisma.user.create({
      data: {
        first_name: 'E2E',
        last_name: 'TemplateAuditor',
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
    const ids = [adminUser.id, auditorUser.id];
    await prisma.mfaChallenge.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { user_id: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  it('TC-01: an authenticated administrator downloads the template with 200', async () => {
    await download(adminToken).expect(200);
  });

  it('TC-02: sets Content-Type to text/csv', async () => {
    const res = await download(adminToken).expect(200);

    expect(res.headers['content-type']).toBe('text/csv');
  });

  it('TC-03: sets the exact Content-Disposition attachment header', async () => {
    const res = await download(adminToken).expect(200);

    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="plantilla_carga_votantes.csv"',
    );
  });

  it('TC-04: returns the raw CSV body (not JSON, not base64)', async () => {
    const res = await download(adminToken).expect(200);

    expect(res.text).toContain('studentCode,firstName,lastName,programCode,email');
    expect(() => {
      JSON.parse(res.text);
    }).toThrow();
  });

  it('TC-05/TC-06: body is valid two-row CSV whose first row holds the official headers', async () => {
    const res = await download(adminToken).expect(200);
    const lines = res.text.trimEnd().split('\n');

    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('studentCode,firstName,lastName,programCode,email');
  });

  it('TC-07: header and description rows have the same number of columns', async () => {
    const res = await download(adminToken).expect(200);
    const [headers, descriptions] = res.text.trimEnd().split('\n').map(splitCsvLine);

    expect(descriptions).toHaveLength(headers.length);
    expect(descriptions).toHaveLength(5);
  });

  it('TC-08: descriptions are Spanish while technical headers remain unchanged', async () => {
    const res = await download(adminToken).expect(200);
    const [headers, descriptions] = res.text.trimEnd().split('\n').map(splitCsvLine);

    expect(headers).toEqual(['studentCode', 'firstName', 'lastName', 'programCode', 'email']);
    for (const description of descriptions) {
      expect(description).toMatch(/obligatorio/i);
    }
  });

  it('TC-AUTH-01: rejects requests without a token with 401', async () => {
    await download().expect(401);
  });

  it('TC-AUTH-02: rejects an invalid token with 401', async () => {
    await download(buildAuthCookie('not-a-real-token')).expect(401);
  });

  it('TC-AUTH-03: rejects an auditor (non-admin) with 403', async () => {
    await download(auditorToken).expect(403);
  });

  it('TC-SIDE-01: downloading the template does not create any elector', async () => {
    const before = await prisma.elector.count();

    await download(adminToken).expect(200);
    await download(adminToken).expect(200);

    expect(await prisma.elector.count()).toBe(before);
  });
});

// Minimal CSV line splitter for assertions (the template's header row is unquoted,
// while description cells are double-quoted and may contain commas).
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}
