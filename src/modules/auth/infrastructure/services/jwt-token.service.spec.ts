import { JwtService } from '@nestjs/jwt';
import type { TokenPayload } from '../../application/ports/token-service.port';
import { JwtTokenService } from './jwt-token.service';

describe('JwtTokenService', () => {
  const userPayload: TokenPayload = {
    sub: 'user-1',
    email: 'admin@example.com',
    actorType: 'USER',
    role: 'ADMINISTRATOR',
  };

  const electorPayload: TokenPayload = {
    sub: 'elector-1',
    email: 'juan@example.com',
    actorType: 'ELECTOR',
  };

  it('keeps access token behavior working', async () => {
    const service = new JwtTokenService(new JwtService({ secret: 'test-jwt-secret' }));

    const token = await service.signAccessToken(userPayload);
    await expect(service.verifyAccessToken(token)).resolves.toEqual(
      expect.objectContaining({
        sub: 'user-1',
        email: 'admin@example.com',
        role: 'ADMINISTRATOR',
      }),
    );
  });

  it('round-trips an ELECTOR payload without role', async () => {
    const service = new JwtTokenService(new JwtService({ secret: 'test-jwt-secret' }));

    const token = await service.signAccessToken(electorPayload);
    const decoded = await service.verifyAccessToken(token);

    expect(decoded).toEqual(
      expect.objectContaining({
        sub: 'elector-1',
        email: 'juan@example.com',
        actorType: 'ELECTOR',
      }),
    );
    expect(decoded).not.toHaveProperty('role');
  });

  it('rejects a tampered access token', async () => {
    const service = new JwtTokenService(new JwtService({ secret: 'test-jwt-secret' }));

    const token = await service.signAccessToken(userPayload);
    const tampered = `${token.slice(0, -2)}xx`;

    await expect(service.verifyAccessToken(tampered)).rejects.toThrow();
  });
});
