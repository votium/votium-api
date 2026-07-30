import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { envs } from 'src/config';
import { IamModule } from 'src/modules/iam/iam.module';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { TOKEN_SERVICE_PORT, type TokenServicePort } from './application/ports/token-service.port';
import { IAM_GATEWAY, type IamGateway } from './application/ports/iam.gateway.port';
import { JwtTokenService } from './infrastructure/services/jwt-token.service';
import { JwtAuthGuard } from './presentation/guards/jwt-auth.guard';
import { RolesGuard } from './presentation/guards/roles.guard';
import { AuthController } from './presentation/controllers/auth.controller';

@Module({
  imports: [
    forwardRef(() => IamModule),
    JwtModule.register({
      secret: envs.jwtSecret,
      signOptions: { expiresIn: envs.jwtExpiresIn },
    }),
  ],
  controllers: [AuthController],
  providers: [
    JwtAuthGuard,
    RolesGuard,
    { provide: TOKEN_SERVICE_PORT, useClass: JwtTokenService },
    {
      provide: LoginUseCase,
      useFactory: (iam: IamGateway, tokens: TokenServicePort) => new LoginUseCase(iam, tokens),
      inject: [IAM_GATEWAY, TOKEN_SERVICE_PORT],
    },
  ],
  exports: [JwtAuthGuard, RolesGuard, { provide: TOKEN_SERVICE_PORT, useClass: JwtTokenService }],
})
export class AuthModule {}
