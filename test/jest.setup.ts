import 'dotenv/config';

process.env.PORT = process.env.PORT ?? '3000';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/votium?schema=public';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-jwt-secret';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '3600';
process.env.SMTP_HOST = process.env.SMTP_HOST ?? 'smtp.gmail.com';
process.env.SMTP_PORT = process.env.SMTP_PORT ?? '587';
process.env.SMTP_SECURE = process.env.SMTP_SECURE ?? 'false';
process.env.SMTP_USER = process.env.SMTP_USER ?? 'votiumvalleu@gmail.com';
process.env.SMTP_PASS = process.env.SMTP_PASS ?? 'test-smtp-pass';
process.env.EMAIL_FROM = process.env.EMAIL_FROM ?? 'votiumvalleu@gmail.com';
process.env.AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? 'access_token';
process.env.AUTH_COOKIE_SECURE = process.env.AUTH_COOKIE_SECURE ?? 'true';
process.env.AUTH_COOKIE_SAMESITE = process.env.AUTH_COOKIE_SAMESITE ?? 'lax';
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS ?? 'http://localhost:5173';
// Keep the automatic-closure cron inert during unit/integration/e2e runs so it can
// never mutate fixtures mid-test; the e2e drives closure explicitly via DI.
process.env.ELECTION_AUTO_CLOSE_ENABLED = process.env.ELECTION_AUTO_CLOSE_ENABLED ?? 'false';
