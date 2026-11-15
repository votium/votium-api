// @nestjs/config is ESM-only and Jest runs in CommonJS: replace only registerAs, which is all this file needs.
jest.mock('@nestjs/config', () => ({
  registerAs: (token: string, factory: () => unknown) => Object.assign(factory, { KEY: token }),
}));

import { FabricConfig, fabricConfig } from './fabric.config';

const load = (): FabricConfig => fabricConfig();

describe('fabricConfig', () => {
  const saved = { ...process.env };
  beforeEach(() => {
    for (const k of Object.keys(process.env)) if (k.startsWith('FABRIC_')) delete process.env[k];
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('requires FABRIC_WRITER_DIR', () => {
    expect(() => load()).toThrow(/FABRIC_WRITER_DIR/);
  });

  it('applies defaults', () => {
    process.env.FABRIC_WRITER_DIR = '/tmp/w';
    const cfg = load();
    expect(cfg.keepAliveMs).toBe(120000);
    expect(cfg.timeouts.commitStatusMs).toBe(60000);
    expect(cfg.auditorDir).toBeUndefined();
  });

  it('rejects a keepalive below the peer minimum', () => {
    process.env.FABRIC_WRITER_DIR = '/tmp/w';
    process.env.FABRIC_KEEPALIVE_MS = '30000';
    expect(() => load()).toThrow(/FABRIC_KEEPALIVE_MS/);
  });

  it('exposes the resilience defaults', () => {
    process.env.FABRIC_WRITER_DIR = '/tmp/w';
    expect(load().resilience).toEqual({
      maxAttempts: 3,
      retryBaseMs: 250,
      maxConcurrentSubmits: 32,
      logCause: false,
    });
  });
});
