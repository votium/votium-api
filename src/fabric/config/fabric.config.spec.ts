import { fabricConfig } from './fabric.config';

describe('fabricConfig', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('requires FABRIC_WRITER_DIR', () => {
    delete process.env.FABRIC_WRITER_DIR;
    expect(() => fabricConfig()).toThrow(/FABRIC_WRITER_DIR/);
  });

  it('applies defaults', () => {
    process.env.FABRIC_WRITER_DIR = '/tmp/w';
    const cfg = fabricConfig();
    expect(cfg.keepAliveMs).toBe(120000);
    expect(cfg.timeouts.commitStatusMs).toBe(60000);
    expect(cfg.auditorDir).toBeUndefined();
  });

  it('rejects a keepalive below the peer minimum', () => {
    process.env.FABRIC_WRITER_DIR = '/tmp/w';
    process.env.FABRIC_KEEPALIVE_MS = '30000';
    expect(() => fabricConfig()).toThrow(/FABRIC_KEEPALIVE_MS/);
  });
});
