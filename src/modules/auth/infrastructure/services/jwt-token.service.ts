import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TokenServicePort } from '../../application/ports/token-service.port';

@Injectable()
export class JwtTokenService implements TokenServicePort {
  constructor(private readonly jwt: JwtService) {}

  signAccessToken(payload: { sub: string; email: string; role: string }): Promise<string> {
    return this.jwt.signAsync(payload);
  }

  verifyAccessToken(token: string): Promise<{
    sub: string;
    email: string;
    role: string;
  }> {
    return this.jwt.verifyAsync(token);
  }
}
