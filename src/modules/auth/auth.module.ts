import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { envs } from 'src/config';
import { UsersModule } from 'src/modules/users/users.module';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { TOKEN_SERVICE_PORT } from './application/ports/tokens';
import { JwtTokenService } from './infrastructure/services/jwt-token.service';
import { JwtAuthGuard } from './presentation/guards/jwt-auth.guard';
import { RolesGuard } from './presentation/guards/roles.guard';
import { AuthController } from './presentation/controllers/auth.controller';

@Global()
@Module({
  imports: [
    UsersModule,
    JwtModule.register({
      secret: envs.jwtSecret,
      signOptions: { expiresIn: envs.jwtExpiresIn },
    }),
  ],
  controllers: [AuthController],
  providers: [
    LoginUseCase,
    JwtAuthGuard,
    RolesGuard,
    { provide: TOKEN_SERVICE_PORT, useClass: JwtTokenService },
  ],
  exports: [JwtAuthGuard, RolesGuard, { provide: TOKEN_SERVICE_PORT, useClass: JwtTokenService }],
})
export class AuthModule {}
