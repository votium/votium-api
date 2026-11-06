import 'dotenv/config';
import * as joi from 'joi';
import { readFileSync } from 'fs';

interface EnvVars {
  PORT: number;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: number;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER: string;
  SMTP_PASS: string;
  EMAIL_FROM: string;
  AUTH_COOKIE_NAME: string;
  AUTH_COOKIE_SECURE: boolean;
  AUTH_COOKIE_SAMESITE: 'strict' | 'lax' | 'none';
  AUTH_COOKIE_DOMAIN?: string;
  CORS_ORIGINS: string;
  ELECTION_AUTO_CLOSE_ENABLED: boolean;
  ELECTION_KEY_ENCRYPTION_KEY_FILE: string;
}

const envsSchema = joi
  .object({
    PORT: joi.number().required(),
    DATABASE_URL: joi.string().required(),
    JWT_SECRET: joi.string().required(),
    JWT_EXPIRES_IN: joi.number().default(3600),
    SMTP_HOST: joi.string().required(),
    SMTP_PORT: joi.number().required(),
    SMTP_SECURE: joi.boolean().default(false),
    SMTP_USER: joi.string().required(),
    SMTP_PASS: joi.string().required(),
    EMAIL_FROM: joi.string().required(),
    AUTH_COOKIE_NAME: joi.string().default('access_token'),
    AUTH_COOKIE_SECURE: joi.boolean().default(true),
    AUTH_COOKIE_SAMESITE: joi.string().valid('strict', 'lax', 'none').default('lax'),
    AUTH_COOKIE_DOMAIN: joi.string().optional(),
    CORS_ORIGINS: joi.string().default('http://localhost:5173'),
    ELECTION_AUTO_CLOSE_ENABLED: joi.boolean().default(true),
    ELECTION_KEY_ENCRYPTION_KEY_FILE: joi.string().required(),
  })
  .unknown(true);

const validationResult = envsSchema.validate(process.env);

if (validationResult.error) {
  throw new Error(`Config validation error: ${validationResult.error.message}`);
}

const envsVars: EnvVars = validationResult.value as EnvVars;

// RFC 6265bis: `SameSite=None` requires `Secure`.
if (envsVars.AUTH_COOKIE_SAMESITE === 'none' && !envsVars.AUTH_COOKIE_SECURE) {
  throw new Error(
    'Config validation error: AUTH_COOKIE_SAMESITE=none requires AUTH_COOKIE_SECURE=true',
  );
}

// Production cookies must always be Secure (spec Business Rule 17).
if (process.env.NODE_ENV === 'production' && !envsVars.AUTH_COOKIE_SECURE) {
  throw new Error('Config validation error: production requires AUTH_COOKIE_SECURE=true');
}

// AES-256 key that encrypts the per-election RSA private keys at rest. It lives in a file (created
// by scripts/generate-election-key.sh; a Docker secret in deployment), never in the database.
// Read once at startup. Anything that is not exactly 32 bytes of base64 aborts the boot.
export function decodeElectionKeyEncryptionKey(raw: string): Buffer {
  const text = raw.trim();
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) {
    throw new Error('Config validation error: election encryption key is not valid base64');
  }
  const key = Buffer.from(text, 'base64');
  if (key.length !== 32) {
    throw new Error('Config validation error: election encryption key must decode to 32 bytes');
  }
  return key;
}

function loadElectionKeyEncryptionKey(filePath: string): Buffer {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch {
    throw new Error(
      `Config validation error: cannot read ELECTION_KEY_ENCRYPTION_KEY_FILE (${filePath}). ` +
        'Create it with: npm run keys:generate',
    );
  }
  return decodeElectionKeyEncryptionKey(raw);
}

const electionKeyEncryptionKey = loadElectionKeyEncryptionKey(
  envsVars.ELECTION_KEY_ENCRYPTION_KEY_FILE,
);

export const envs = {
  port: envsVars.PORT,
  databaseUrl: envsVars.DATABASE_URL,
  jwtSecret: envsVars.JWT_SECRET,
  jwtExpiresIn: envsVars.JWT_EXPIRES_IN,
  smtpHost: envsVars.SMTP_HOST,
  smtpPort: envsVars.SMTP_PORT,
  smtpSecure: envsVars.SMTP_SECURE,
  smtpUser: envsVars.SMTP_USER,
  smtpPass: envsVars.SMTP_PASS,
  emailFrom: envsVars.EMAIL_FROM,
  authCookieName: envsVars.AUTH_COOKIE_NAME,
  authCookieSecure: envsVars.AUTH_COOKIE_SECURE,
  authCookieSameSite: envsVars.AUTH_COOKIE_SAMESITE,
  authCookieDomain: envsVars.AUTH_COOKIE_DOMAIN,
  corsOrigins: envsVars.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  electionAutoCloseEnabled: envsVars.ELECTION_AUTO_CLOSE_ENABLED,
  electionKeyEncryptionKey,
};
