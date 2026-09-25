/**
 * Config boot-guard tests (module-boot / import-time throw).
 *
 * Documented exception to docs/TESTING.md "Config: Do not test": the approved
 * plan (Step 12) requires that hostile cookie combinations are rejected at
 * config validation. These cases cannot be expressed through AuthCookieService
 * (it only reads validated envs), so the invariant is asserted at the boot edge.
 *
 * The config module is deliberately re-required with jest.resetModules() so the
 * import-time guards re-run under the hostile environment combination.
 */

const ERROR_NONE_WITHOUT_SECURE = 'AUTH_COOKIE_SAMESITE=none requires AUTH_COOKIE_SECURE=true';
const ERROR_PRODUCTION_WITHOUT_SECURE = 'production requires AUTH_COOKIE_SECURE=true';

const loadConfig = () => jest.requireActual<typeof import('./index')>('./index');

describe('envs config validation (boot guards)', () => {
  const originalEnv: NodeJS.ProcessEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  it('rejects AUTH_COOKIE_SAMESITE=none when AUTH_COOKIE_SECURE=false', () => {
    process.env.AUTH_COOKIE_SAMESITE = 'none';
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.NODE_ENV = 'test';

    jest.resetModules();
    expect(loadConfig).toThrow(ERROR_NONE_WITHOUT_SECURE);
  });

  it('rejects production when AUTH_COOKIE_SECURE=false', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_COOKIE_SECURE = 'false';

    jest.resetModules();
    expect(loadConfig).toThrow(ERROR_PRODUCTION_WITHOUT_SECURE);
  });

  it('allows the default configuration to load', () => {
    jest.resetModules();
    expect(loadConfig).not.toThrow();

    const config = loadConfig();
    expect(config.envs.authCookieName).toBe('access_token');
    expect(config.envs.authCookieSecure).toBe(true);
  });
});
