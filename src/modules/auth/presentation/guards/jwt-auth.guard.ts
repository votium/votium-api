import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Inject,
} from '@nestjs/common';
import { Request } from 'express';
import {
  TOKEN_SERVICE_PORT,
  type TokenServicePort,
} from '../../application/ports/token-service.port';
import { AuthCookieService } from '../services/auth-cookie.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(TOKEN_SERVICE_PORT) private readonly tokens: TokenServicePort,
    private readonly cookies: AuthCookieService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user: unknown }>();
    const token = this.cookies.extract(req);
    if (!token) throw new UnauthorizedException('Authentication required.');

    try {
      const payload = await this.tokens.verifyAccessToken(token);
      req.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token.');
    }
  }
}
