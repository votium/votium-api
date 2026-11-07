import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

export interface FabricConfig {
  writerDir: string;
  auditorDir?: string;
  keepAliveMs: number;
  timeouts: { evaluateMs: number; endorseMs: number; submitMs: number; commitStatusMs: number };
}

// Only paths and timings. Never keys or certificates in environment variables.
const schema = Joi.object({
  FABRIC_WRITER_DIR: Joi.string().required(),
  FABRIC_AUDITOR_DIR: Joi.string().empty('').optional(),
  // The peer allows one keepalive ping per 60 s (peer.keepalive.minInterval): never go below.
  FABRIC_KEEPALIVE_MS: Joi.number().integer().min(60000).default(120000),
  FABRIC_EVALUATE_TIMEOUT_MS: Joi.number().integer().min(1000).default(10000),
  FABRIC_ENDORSE_TIMEOUT_MS: Joi.number().integer().min(1000).default(30000),
  FABRIC_SUBMIT_TIMEOUT_MS: Joi.number().integer().min(1000).default(15000),
  FABRIC_COMMIT_STATUS_TIMEOUT_MS: Joi.number().integer().min(1000).default(60000),
}).unknown(true);

export const fabricConfig = registerAs('fabric', (): FabricConfig => {
  const { error, value } = schema.validate(process.env, { abortEarly: false });
  if (error) {
    throw new Error(
      `Invalid Fabric configuration: ${error.details.map((d) => d.message).join('; ')}`,
    );
  }
  return {
    writerDir: value.FABRIC_WRITER_DIR,
    auditorDir: value.FABRIC_AUDITOR_DIR || undefined,
    keepAliveMs: value.FABRIC_KEEPALIVE_MS,
    timeouts: {
      evaluateMs: value.FABRIC_EVALUATE_TIMEOUT_MS,
      endorseMs: value.FABRIC_ENDORSE_TIMEOUT_MS,
      submitMs: value.FABRIC_SUBMIT_TIMEOUT_MS,
      commitStatusMs: value.FABRIC_COMMIT_STATUS_TIMEOUT_MS,
    },
  };
});
