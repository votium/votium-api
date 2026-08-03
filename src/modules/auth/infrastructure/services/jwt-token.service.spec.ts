import { JwtService } from '@nestjs/jwt';
import type { TokenPayload } from '../../application/ports/token-service.port';
import { JwtTokenService } from './jwt-token.service';

describe('JwtTokenService', () => {
  const payload: TokenPayload = {
    sub: 'user-1',
    email: 'admin@example.com',
    role: 'ADMINISTRATOR',
  };

  it('keeps access token behavior working', async () => {
    const service = new JwtTokenService(new JwtService({ secret: 'test-jwt-secret' }));

    const token = await service.signAccessToken(payload);
    await expect(service.verifyAccessToken(token)).resolves.toEqual(
      expect.objectContaining({
        sub: 'user-1',
        email: 'admin@example.com',
        role: 'ADMINISTRATOR',
      }),
    );
  });

  it('rejects a tampered access token', async () => {
    const service = new JwtTokenService(new JwtService({ secret: 'test-jwt-secret' }));

    const token = await service.signAccessToken(payload);
    const tampered = `${token.slice(0, -2)}xx`;

    await expect(service.verifyAccessToken(tampered)).rejects.toThrow();
  });
});
