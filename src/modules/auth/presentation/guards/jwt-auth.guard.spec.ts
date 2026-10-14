import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { Request } from 'express';
import type { TokenServicePort } from '../../application/ports/token-service.port';
import { AuthCookieService } from '../services/auth-cookie.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { envs } from 'src/config';

type GuardRequest = Request & { user?: unknown };

function contextFor(req: Partial<GuardRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const payload = {
    sub: 'user-1',
    email: 'admin@example.com',
    actorType: 'USER',
    role: 'ADMINISTRATOR',
  } as const;

  let tokens: jest.Mocked<TokenServicePort>;
  let cookies: AuthCookieService;
  let extractMock: jest.Mock<string | undefined, [req: Request]>;

  beforeEach(() => {
    tokens = {
      signAccessToken: jest.fn(),
      verifyAccessToken: jest.fn(),
    };
    extractMock = jest.fn<string | undefined, [req: Request]>();
    cookies = { extract: extractMock } as unknown as AuthCookieService;
  });

  it('G1: accepts a valid cookie and attaches the principal', async () => {
    extractMock.mockReturnValue('jwt');
    tokens.verifyAccessToken.mockResolvedValue(payload);
    const req = {} as GuardRequest;
    const guard = new JwtAuthGuard(tokens, cookies);

    await expect(guard.canActivate(contextFor(req))).resolves.toBe(true);
    expect(req.user).toBe(payload);
  });

  it('G2: rejects when the cookie is missing (Authentication required.)', async () => {
    extractMock.mockReturnValue(undefined);
    const guard = new JwtAuthGuard(tokens, cookies);

    await expect(guard.canActivate(contextFor({}))).rejects.toThrow(
      new UnauthorizedException('Authentication required.'),
    );
    expect(tokens.verifyAccessToken.mock.calls.length).toBe(0);
  });

  it('G3: rejects a malformed cookie value (Invalid token.)', async () => {
    extractMock.mockReturnValue('not-a-jwt');
    tokens.verifyAccessToken.mockRejectedValue(new Error('jwt malformed'));
    const guard = new JwtAuthGuard(tokens, cookies);

    await expect(guard.canActivate(contextFor({}))).rejects.toThrow(
      new UnauthorizedException('Invalid token.'),
    );
  });

  it('G4: rejects an invalid-signature token (Invalid token.)', async () => {
    extractMock.mockReturnValue('jwt');
    tokens.verifyAccessToken.mockRejectedValue(new JsonWebTokenError('invalid signature'));
    const guard = new JwtAuthGuard(tokens, cookies);

    await expect(guard.canActivate(contextFor({}))).rejects.toThrow(
      new UnauthorizedException('Invalid token.'),
    );
  });

  it('G5: rejects an expired token (Invalid token.)', async () => {
    extractMock.mockReturnValue('jwt');
    tokens.verifyAccessToken.mockRejectedValue(new TokenExpiredError('jwt expired', new Date()));
    const guard = new JwtAuthGuard(tokens, cookies);

    await expect(guard.canActivate(contextFor({}))).rejects.toThrow(
      new UnauthorizedException('Invalid token.'),
    );
  });

  it('G6: ignores the Authorization header (cookie-only contract)', async () => {
    extractMock.mockReturnValue(undefined);
    const req = { headers: { authorization: `Bearer ${'a-valid-jwt'}` } } as GuardRequest;
    const guard = new JwtAuthGuard(tokens, cookies);

    await expect(guard.canActivate(contextFor(req))).rejects.toThrow(
      new UnauthorizedException('Authentication required.'),
    );
    expect(tokens.verifyAccessToken.mock.calls.length).toBe(0);
  });

  it('G7: passes the exact TokenPayload to req.user (authorization parity)', async () => {
    extractMock.mockReturnValue('jwt');
    const resolved = {
      sub: 'user-7',
      email: 'auditor@example.com',
      actorType: 'USER',
      role: 'AUDITOR',
    } as const;
    tokens.verifyAccessToken.mockResolvedValue(resolved);
    const req = {} as GuardRequest;
    const guard = new JwtAuthGuard(tokens, cookies);

    await guard.canActivate(contextFor(req));
    expect(req.user).toEqual(resolved);
    expect(req.user).toHaveProperty('role', 'AUDITOR');
  });

  it('G8: error messages never leak the token or the secret', async () => {
    const cases: Array<{ extractValue: string | undefined; verifyError: unknown }> = [
      { extractValue: undefined, verifyError: new Error('unused') },
      { extractValue: 'super-secret-token-string', verifyError: new Error('malformed') },
      { extractValue: 'jwt', verifyError: new JsonWebTokenError('bad signature') },
      { extractValue: 'jwt', verifyError: new TokenExpiredError('expired', new Date()) },
    ];

    for (const { extractValue, verifyError } of cases) {
      extractMock.mockReturnValue(extractValue);
      tokens.verifyAccessToken.mockRejectedValue(verifyError);
      const guard = new JwtAuthGuard(tokens, cookies);

      try {
        await guard.canActivate(contextFor({}));
        throw new Error('guard unexpectedly allowed the request');
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        const response = (error as UnauthorizedException).getResponse();
        const serialized = JSON.stringify(response);
        expect(serialized).not.toContain('super-secret-token-string');
        expect(serialized).not.toContain('jwt');
        expect(serialized).not.toContain(envs.jwtSecret);
      }
    }
  });

  it('G9: never returns 500 for any guard input (all failures are UnauthorizedException)', async () => {
    const attempts = [
      async () => {
        extractMock.mockReturnValue(undefined);
        await new JwtAuthGuard(tokens, cookies).canActivate(contextFor({}));
      },
      async () => {
        extractMock.mockReturnValue('not-a-jwt');
        tokens.verifyAccessToken.mockRejectedValue(new Error('malformed'));
        await new JwtAuthGuard(tokens, cookies).canActivate(contextFor({}));
      },
      async () => {
        extractMock.mockReturnValue('jwt');
        tokens.verifyAccessToken.mockRejectedValue(new TokenExpiredError('expired', new Date()));
        await new JwtAuthGuard(tokens, cookies).canActivate(contextFor({}));
      },
    ];

    for (const attempt of attempts) {
      await expect(attempt()).rejects.toBeInstanceOf(UnauthorizedException);
    }
  });
});
