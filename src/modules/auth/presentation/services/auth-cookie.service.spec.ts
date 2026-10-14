import type { CookieOptions, Request, Response } from 'express';
import { envs } from 'src/config';
import { AuthCookieService } from './auth-cookie.service';

describe('AuthCookieService', () => {
  let service: AuthCookieService;
  let res: { cookie: jest.Mock; clearCookie: jest.Mock };

  beforeEach(() => {
    service = new AuthCookieService();
    res = { cookie: jest.fn(), clearCookie: jest.fn() };
  });

  it('C6: name getter returns the configured cookie name', () => {
    expect(service.name).toBe(envs.authCookieName);
  });

  it('C1: setAccessToken writes the cookie with the full attribute set', () => {
    service.setAccessToken(res as unknown as Response, 'jwt', 3600);

    expect(res.cookie).toHaveBeenCalledWith(
      envs.authCookieName,
      'jwt',
      expect.objectContaining<CookieOptions>({
        httpOnly: true,
        secure: envs.authCookieSecure,
        sameSite: envs.authCookieSameSite,
        path: '/',
        maxAge: 3600 * 1000,
      }),
    );
  });

  it('C2: maxAge (ms) is synchronized with the JWT lifetime in seconds', () => {
    service.setAccessToken(res as unknown as Response, 'jwt', envs.jwtExpiresIn);

    const options = (res.cookie.mock.calls[0] as unknown[])[2] as CookieOptions;
    expect(options.maxAge).toBe(envs.jwtExpiresIn * 1000);
  });

  describe('C3: domain is included only when configured', () => {
    it('omits the domain when AUTH_COOKIE_DOMAIN is not set', () => {
      Object.defineProperty(envs, 'authCookieDomain', { value: undefined, configurable: true });

      service.setAccessToken(res as unknown as Response, 'jwt', 3600);

      const options = (res.cookie.mock.calls[0] as unknown[])[2] as CookieOptions;
      // `domain` is `?? undefined` (per plan Step 3), i.e. not serialized on the wire.
      expect(options.domain).toBeUndefined();
    });

    it('passes the domain when AUTH_COOKIE_DOMAIN is configured', () => {
      Object.defineProperty(envs, 'authCookieDomain', {
        value: 'auth.example.com',
        configurable: true,
      });

      service.setAccessToken(res as unknown as Response, 'jwt', 3600);

      const options = (res.cookie.mock.calls[0] as unknown[])[2] as CookieOptions;
      expect(options.domain).toBe('auth.example.com');
    });
  });

  it('C4: clearAccessToken clears with matching attributes and an immediate Max-Age of 0', () => {
    service.clearAccessToken(res as unknown as Response);

    expect(res.cookie).toHaveBeenCalledWith(
      envs.authCookieName,
      '',
      expect.objectContaining<CookieOptions>({
        httpOnly: true,
        secure: envs.authCookieSecure,
        sameSite: envs.authCookieSameSite,
        path: '/',
        maxAge: 0,
      }),
    );

    const options = (res.cookie.mock.calls[0] as unknown[])[2] as CookieOptions;
    expect(options.maxAge).toBe(0);
  });

  it('C5: extract reads the configured cookie name', () => {
    const req = { cookies: { [envs.authCookieName]: 'jwt-value' } } as unknown as Request;
    expect(service.extract(req)).toBe('jwt-value');

    expect(service.extract({ cookies: {} } as unknown as Request)).toBeUndefined();
    expect(service.extract({} as unknown as Request)).toBeUndefined();
  });
});
