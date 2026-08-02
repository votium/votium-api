import 'dotenv/config';
import * as joi from 'joi';

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
  })
  .unknown(true);

const validationResult = envsSchema.validate(process.env);

if (validationResult.error) {
  throw new Error(`Config validation error: ${validationResult.error.message}`);
}

const envsVars: EnvVars = validationResult.value as EnvVars;

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
};
