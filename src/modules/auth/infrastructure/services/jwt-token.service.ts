import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RoleName } from 'src/modules/users/domain/value-objects/role-name.vo';
import { TokenServicePort } from '../../application/ports/token-service.port';

@Injectable()
export class JwtTokenService implements TokenServicePort {
  constructor(private readonly jwt: JwtService) {}

  async signAccessToken(payload: { sub: string; email: string; role: RoleName }): Promise<string> {
    return this.jwt.signAsync(payload);
  }

  async verifyAccessToken(token: string): Promise<{
    sub: string;
    email: string;
    role: RoleName;
  }> {
    return this.jwt.verifyAsync(token);
  }
}
