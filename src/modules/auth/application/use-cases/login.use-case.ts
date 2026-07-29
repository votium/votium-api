import { Inject, Injectable } from '@nestjs/common';
import { InvalidCredentialsException } from '../../domain/exceptions/invalid-credentials.exception';
import { IAM_GATEWAY, type IamGateway } from '../ports/iam.gateway.port';
import type { TokenServicePort } from '../ports/token-service.port';
import { TOKEN_SERVICE_PORT } from '../ports/tokens';

@Injectable()
export class LoginUseCase {
  constructor(
    @Inject(IAM_GATEWAY) private readonly iam: IamGateway,
    @Inject(TOKEN_SERVICE_PORT) private readonly tokens: TokenServicePort,
  ) {}

  async execute(input: { email: string; password: string }) {
    const user = await this.iam.validateCredentials(input.email, input.password);
    if (!user) throw new InvalidCredentialsException();

    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }
}
