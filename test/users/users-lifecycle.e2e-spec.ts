import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { App } from 'supertest/types';
import * as jwt from 'jsonwebtoken';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/shared/database/prisma.service';
import { GlobalExceptionFilter } from '../../src/shared/exceptions/filters/global-exception.filter';
import {
  ASYNC_EMAIL_SERVICE_PORT,
  type AsyncEmailServicePort,
} from '../../src/modules/auth/application/ports/async-email-service.port';
import { NodeCryptoPasswordHasherService } from '../../src/modules/iam/infrastructure/services/node-crypto-password-hasher.service';
import { RoleName } from '../../src/modules/iam/domain/value-objects/role-name.vo';
import { envs } from '../../src/config';
import { buildAuthCookie } from '../auth/auth-cookie.utils';

class FakeEmailService implements AsyncEmailServicePort {
  queueVerificationCode(): Promise<void> {
    return Promise.resolve();
  }
}

interface ErrorBody {
  statusCode: number;
  error: string;
}

describe('Users lifecycle (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const suffix = Date.now();
  const usedUserIds: string[] = [];
  let seededUserIds: string[] = [];
  let adminRoleId: string;
  let auditorRoleId: string;
  let adminId: string;
  let preexistingAuditorIds: string[] = [];

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
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    const hasher = new NodeCryptoPasswordHasherService();
    adminRoleId = (
      await prisma.role.upsert({
        where: { name: RoleName.ADMINISTRATOR.value },
        update: {},
        create: { name: RoleName.ADMINISTRATOR.value },
      })
    ).id;
    auditorRoleId = (
      await prisma.role.upsert({
        where: { name: RoleName.AUDITOR.value },
        update: {},
        create: { name: RoleName.AUDITOR.value },
      })
    ).id;

    const admin = await prisma.user.create({
      data: {
        first_name: 'E2E',
        last_name: 'Admin',
        email: `ul-admin-${suffix}@example.com`,
        password_hash: await hasher.hash('SuperSecret123!'),
        role_id: adminRoleId,
        status: 'ACTIVE',
      },
    });
    adminId = admin.id;
    usedUserIds.push(admin.id);

    // Own the global "active Auditor" population for the last-Auditor scenarios.
    const preexisting = await prisma.user.findMany({
      where: { role_id: auditorRoleId, status: 'ACTIVE', deleted_at: null },
      select: { id: true },
    });
    preexistingAuditorIds = preexisting.map((a) => a.id);
    if (preexistingAuditorIds.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: preexistingAuditorIds } },
        data: { status: 'DISABLED' },
      });
    }
  });

  afterEach(async () => {
    if (seededUserIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { user_id: { in: seededUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: seededUserIds } } });
      seededUserIds = [];
    }
  });

  afterAll(async () => {
    if (preexistingAuditorIds.length > 0) {
      await prisma.user.updateMany({
        where: { id: { in: preexistingAuditorIds } },
        data: { status: 'ACTIVE' },
      });
    }
    await prisma.auditLog.deleteMany({ where: { user_id: { in: usedUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: usedUserIds } } });
    await app.close();
  });

  const adminToken = () =>
    buildAuthCookie(
      jwt.sign(
        { sub: adminId, email: 'admin@example.com', actorType: 'USER', role: 'ADMINISTRATOR' },
        envs.jwtSecret,
        { expiresIn: envs.jwtExpiresIn },
      ),
    );

  const auditorToken = (id: string) =>
    buildAuthCookie(
      jwt.sign(
        { sub: id, email: 'auditor@example.com', actorType: 'USER', role: 'AUDITOR' },
        envs.jwtSecret,
        { expiresIn: envs.jwtExpiresIn },
      ),
    );

  async function seedUser(
    roleId: string,
    opts: { status?: string; deletedAt?: Date } = {},
  ): Promise<{ id: string; email: string }> {
    const roleTag = roleId === auditorRoleId ? 'aud' : 'adm';
    const email = `ul-${roleTag}-${suffix}-${Math.random().toString(36).slice(2, 8)}@example.com`;
    const row = await prisma.user.create({
      data: {
        first_name: 'Test',
        last_name: 'User',
        email,
        password_hash: 'pbkdf2$placeholder',
        role_id: roleId,
        status: opts.status ?? 'ACTIVE',
        deleted_at: opts.deletedAt ?? null,
      },
    });
    seededUserIds.push(row.id);
    return { id: row.id, email };
  }

  describe('PATCH /users/:id/activate', () => {
    it('UL-ACT-01: activates an inactive user', async () => {
      const target = await seedUser(adminRoleId, { status: 'DISABLED' });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${target.id}/activate`)
        .set('Cookie', adminToken())
        .expect(200);

      expect((res.body as { status: string }).status).toBe('ACTIVE');
    });

    it('UL-ACT-02: rejects an already active user', async () => {
      const target = await seedUser(adminRoleId, { status: 'ACTIVE' });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${target.id}/activate`)
        .set('Cookie', adminToken())
        .expect(409);

      expect((res.body as ErrorBody).error).toBe('USER_ALREADY_ACTIVE');
    });

    it('UL-ACT-03: rejects a missing user', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${crypto.randomUUID()}/activate`)
        .set('Cookie', adminToken())
        .expect(404);
    });

    it('UL-ACT-04: rejects an invalid id', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/not-a-uuid/activate')
        .set('Cookie', adminToken())
        .expect(400);
    });

    it('UL-ACT-05: rejects without auth', async () => {
      const target = await seedUser(adminRoleId, { status: 'DISABLED' });
      await request(app.getHttpServer()).patch(`/api/v1/users/${target.id}/activate`).expect(401);
    });

    it('UL-ACT-06: rejects an AUDITOR actor', async () => {
      const actor = await seedUser(auditorRoleId);
      const target = await seedUser(adminRoleId, { status: 'DISABLED' });

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${target.id}/activate`)
        .set('Cookie', auditorToken(actor.id))
        .expect(403);
    });

    it('UL-ACT-07: rejects a deleted user (404)', async () => {
      const target = await seedUser(adminRoleId, { deletedAt: new Date() });

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${target.id}/activate`)
        .set('Cookie', adminToken())
        .expect(404);
    });
  });

  describe('PATCH /users/:id/deactivate', () => {
    it('UL-DE-01: deactivates an active user', async () => {
      const target = await seedUser(adminRoleId, { status: 'ACTIVE' });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${target.id}/deactivate`)
        .set('Cookie', adminToken())
        .expect(200);

      expect(res.body).toMatchObject({ message: 'User deactivated successfully.' });
    });

    it('UL-DE-02: rejects an already disabled user', async () => {
      const target = await seedUser(adminRoleId, { status: 'DISABLED' });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${target.id}/deactivate`)
        .set('Cookie', adminToken())
        .expect(409);

      expect((res.body as ErrorBody).error).toBe('USER_ALREADY_DISABLED');
    });

    it('UL-DE-03: rejects a missing user', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${crypto.randomUUID()}/deactivate`)
        .set('Cookie', adminToken())
        .expect(404);
    });

    it('UL-DE-04: rejects an invalid id', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/users/not-a-uuid/deactivate')
        .set('Cookie', adminToken())
        .expect(400);
    });

    it('UL-DE-05: rejects without auth', async () => {
      const target = await seedUser(adminRoleId);
      await request(app.getHttpServer()).patch(`/api/v1/users/${target.id}/deactivate`).expect(401);
    });

    it('UL-DE-06: rejects an AUDITOR actor', async () => {
      const actor = await seedUser(auditorRoleId);
      const target = await seedUser(adminRoleId);

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${target.id}/deactivate`)
        .set('Cookie', auditorToken(actor.id))
        .expect(403);
    });

    it('UL-DE-07: rejects self-deactivation', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${adminId}/deactivate`)
        .set('Cookie', adminToken())
        .expect(403);

      expect((res.body as ErrorBody).error).toBe('USER_SELF_DISABLE');
    });

    it('UL-DE-08: rejects deactivating the last active Auditor', async () => {
      const target = await seedUser(auditorRoleId, { status: 'ACTIVE' });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${target.id}/deactivate`)
        .set('Cookie', adminToken())
        .expect(409);

      expect((res.body as ErrorBody).error).toBe('LAST_AUDITOR');
    });

    it('UL-DE-09: deactivates an Auditor while another active Auditor exists', async () => {
      await seedUser(auditorRoleId, { status: 'ACTIVE' });
      const target = await seedUser(auditorRoleId, { status: 'ACTIVE' });

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${target.id}/deactivate`)
        .set('Cookie', adminToken())
        .expect(200);
    });

    it('UL-DE-10: deactivates a non-Auditor', async () => {
      const target = await seedUser(adminRoleId, { status: 'ACTIVE' });

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${target.id}/deactivate`)
        .set('Cookie', adminToken())
        .expect(200);
    });
  });

  describe('DELETE /users/:id', () => {
    it('UL-DEL-01: logically deletes an active non-Auditor', async () => {
      const target = await seedUser(adminRoleId, { status: 'ACTIVE' });

      await request(app.getHttpServer())
        .delete(`/api/v1/users/${target.id}`)
        .set('Cookie', adminToken())
        .expect(204);

      const row = await prisma.user.findUnique({ where: { id: target.id } });
      expect(row).not.toBeNull();
      expect(row?.deleted_at).not.toBeNull();
    });

    it('UL-DEL-02: deletes an Auditor while another active Auditor exists', async () => {
      await seedUser(auditorRoleId, { status: 'ACTIVE' });
      const target = await seedUser(auditorRoleId, { status: 'ACTIVE' });

      await request(app.getHttpServer())
        .delete(`/api/v1/users/${target.id}`)
        .set('Cookie', adminToken())
        .expect(204);
    });

    it('UL-DEL-03: rejects deleting the last active Auditor', async () => {
      const target = await seedUser(auditorRoleId, { status: 'ACTIVE' });

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/users/${target.id}`)
        .set('Cookie', adminToken())
        .expect(409);

      expect((res.body as ErrorBody).error).toBe('LAST_AUDITOR');
    });

    it('UL-DEL-04: deletes an inactive Auditor', async () => {
      const target = await seedUser(auditorRoleId, { status: 'DISABLED' });

      await request(app.getHttpServer())
        .delete(`/api/v1/users/${target.id}`)
        .set('Cookie', adminToken())
        .expect(204);
    });

    it('UL-DEL-05: rejects an already-deleted user', async () => {
      const target = await seedUser(adminRoleId, { deletedAt: new Date() });

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/users/${target.id}`)
        .set('Cookie', adminToken())
        .expect(409);

      expect((res.body as ErrorBody).error).toBe('USER_ALREADY_DELETED');
    });

    it('UL-DEL-06: rejects a missing user', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/users/${crypto.randomUUID()}`)
        .set('Cookie', adminToken())
        .expect(404);
    });

    it('UL-DEL-07: rejects an invalid id', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/users/not-a-uuid')
        .set('Cookie', adminToken())
        .expect(400);
    });

    it('UL-DEL-08: rejects without auth', async () => {
      const target = await seedUser(adminRoleId);
      await request(app.getHttpServer()).delete(`/api/v1/users/${target.id}`).expect(401);
    });

    it('UL-DEL-09: rejects an AUDITOR actor', async () => {
      const actor = await seedUser(auditorRoleId);
      const target = await seedUser(adminRoleId);

      await request(app.getHttpServer())
        .delete(`/api/v1/users/${target.id}`)
        .set('Cookie', auditorToken(actor.id))
        .expect(403);
    });

    it('UL-DEL-13: rejects self-delete', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/users/${adminId}`)
        .set('Cookie', adminToken())
        .expect(403);

      expect((res.body as ErrorBody).error).toBe('USER_SELF_DELETE');
    });

    it('UL-DEL-10: preserves the row and relationships', async () => {
      const target = await seedUser(adminRoleId, { status: 'ACTIVE' });

      await request(app.getHttpServer())
        .delete(`/api/v1/users/${target.id}`)
        .set('Cookie', adminToken())
        .expect(204);

      const row = await prisma.user.findUnique({ where: { id: target.id } });
      expect(row?.deleted_at).not.toBeNull();
      expect(row?.role_id).toBe(adminRoleId);
      expect(row?.email).toBe(target.email);
    });

    it('UL-DEL-11: excludes a deleted user from the listing', async () => {
      const target = await seedUser(adminRoleId, { status: 'ACTIVE' });

      await request(app.getHttpServer())
        .delete(`/api/v1/users/${target.id}`)
        .set('Cookie', adminToken())
        .expect(204);

      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Cookie', adminToken())
        .expect(200);

      const ids = (res.body as { data: Array<{ id: string }> }).data.map((u) => u.id);
      expect(ids).not.toContain(target.id);
    });

    it('UL-DEL-12: a deleted user cannot authenticate', async () => {
      const target = await seedUser(adminRoleId, { deletedAt: new Date() });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: target.email, password: 'anything' })
        .expect(403);

      expect((res.body as ErrorBody).statusCode).toBe(403);
    });
  });

  describe('route rename', () => {
    it('UL-RN-01: PATCH /users/:id/deactivate works', async () => {
      const target = await seedUser(adminRoleId, { status: 'ACTIVE' });

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${target.id}/deactivate`)
        .set('Cookie', adminToken())
        .expect(200);
    });

    it('UL-RN-02: PATCH /users/:id/disable is removed', async () => {
      const target = await seedUser(adminRoleId, { status: 'ACTIVE' });

      await request(app.getHttpServer())
        .patch(`/api/v1/users/${target.id}/disable`)
        .set('Cookie', adminToken())
        .expect(404);
    });
  });
});
