import { Injectable } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { envs } from 'src/config';

/**
 * Single owner of the authentication-cookie attributes (spec Business Rules 3
 * and 16). Controllers and guards must not duplicate cookie configuration.
 */
@Injectable()
export class AuthCookieService {
  get name(): string {
    return envs.authCookieName;
  }

  extract(req: Request): string | undefined {
    const cookies = req.cookies as Record<string, string> | undefined;
    return cookies?.[this.name];
  }

  setAccessToken(res: Response, token: string, maxAgeSeconds: number): void {
    res.cookie(this.name, token, this.buildOptions(maxAgeSeconds));
  }

  clearAccessToken(res: Response): void {
    // Express 5 `res.clearCookie` strips `maxAge` before serializing, so the
    // wire would never show `Max-Age=0`. Writing an empty value via `res.cookie`
    // keeps the full attribute set and emits `Max-Age: 0` (immediate expiry).
    res.cookie(this.name, '', this.clearOptions());
  }

  private buildOptions(maxAgeSeconds: number): CookieOptions {
    return {
      httpOnly: true,
      secure: envs.authCookieSecure,
      sameSite: envs.authCookieSameSite,
      path: '/',
      domain: envs.authCookieDomain ?? undefined,
      // Express cookie maxAge is milliseconds while JWT_EXPIRES_IN is seconds,
      // so the wire `Max-Age` matches the JWT lifetime (spec: synchronized).
      maxAge: maxAgeSeconds * 1000,
    };
  }

  private clearOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: envs.authCookieSecure,
      sameSite: envs.authCookieSameSite,
      path: '/',
      domain: envs.authCookieDomain ?? undefined,
      // `Max-Age: 0` combined with Express's immediate `Expires` makes the
      // revocation unambiguous on the wire.
      maxAge: 0,
    };
  }
}
