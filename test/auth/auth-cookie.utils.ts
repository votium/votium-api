import { envs } from '../../src/config';

/**
 * Structural subset of a supertest response carrying Set-Cookie.
 * Declared locally (rather than importing supertest types) so the helper stays
 * a pure, framework-light module usable by every migrated e2e spec.
 */
export interface SetCookieHttpResponse {
  headers: { 'set-cookie'?: string[] };
}

function pickAuthSetCookie(res: SetCookieHttpResponse): string {
  const entries = res.headers['set-cookie'];
  if (!entries || entries.length === 0) {
    throw new Error(
      `No Set-Cookie header found. Expected a cookie named "${envs.authCookieName}".`,
    );
  }
  const auth = entries.find((entry) => entry.startsWith(`${envs.authCookieName}=`));
  return auth ?? entries[0];
}

/**
 * Returns `access_token=<jwt>` from the auth Set-Cookie header.
 * Throws a descriptive error when no cookie was issued (test authoring aid).
 */
export function extractAuthCookie(res: SetCookieHttpResponse): string {
  return pickAuthSetCookie(res).split(';')[0];
}

/** Returns the full raw auth Set-Cookie header (with attributes) for assertions. */
export function getAuthCookieHeader(res: SetCookieHttpResponse): string {
  return pickAuthSetCookie(res);
}

/** Builds a `name=value` Cookie header value from a raw JWT (`jwt.sign`, etc.). */
export function buildAuthCookie(token: string): string {
  return `${envs.authCookieName}=${token}`;
}

/** Parses a raw Set-Cookie header into `{ HttpOnly: true, 'Max-Age': '3600', ... }`. */
export function parseSetCookie(header: string): Record<string, string | true> {
  const attrs: Record<string, string | true> = {};
  for (const rawPart of header.split(';')) {
    const part = rawPart.trim();
    if (!part) continue;
    const eq = part.indexOf('=');
    if (eq === -1) {
      attrs[part] = true;
    } else {
      attrs[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
    }
  }
  return attrs;
}
