import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { TokenPayload, TokenServicePort } from '../../application/ports/token-service.port';

@Injectable()
export class JwtTokenService implements TokenServicePort {
  constructor(private readonly jwt: JwtService) {}

  signAccessToken(payload: TokenPayload): Promise<string> {
    return this.jwt.signAsync(payload);
  }

  verifyAccessToken(token: string): Promise<TokenPayload> {
    return this.jwt.verifyAsync(token);
  }
}
