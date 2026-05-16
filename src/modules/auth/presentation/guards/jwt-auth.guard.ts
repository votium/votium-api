import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { Request } from "express";
import type { TokenServicePort } from "../../application/ports/token-service.port";
import { TOKEN_SERVICE_PORT } from "../../application/ports/tokens";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(TOKEN_SERVICE_PORT) private readonly tokens: TokenServicePort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const auth = req.headers["authorization"];
    if (!auth) throw new UnauthorizedException("Missing Authorization header");

    const [type, token] = auth.split(" ");
    if (type !== "Bearer" || !token)
      throw new UnauthorizedException("Invalid Authorization header");

    try {
      const payload = await this.tokens.verifyAccessToken(token);
      (req as any).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException("Invalid token");
    }
  }
}
