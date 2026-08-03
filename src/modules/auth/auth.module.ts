import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { envs } from 'src/config';
import { IamModule } from 'src/modules/iam/iam.module';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { VerifyMfaUseCase } from './application/use-cases/verify-mfa.use-case';
import { ResendMfaUseCase } from './application/use-cases/resend-mfa.use-case';
import { TOKEN_SERVICE_PORT } from './application/ports/token-service.port';
import { OTP_GENERATOR_PORT } from './application/ports/otp-generator.port';
import { EMAIL_SERVICE_PORT } from './application/ports/email-service.port';
import { MFA_CHALLENGE_REPOSITORY } from './domain/repositories/mfa-challenge.repository.interface';
import { JwtTokenService } from './infrastructure/services/jwt-token.service';
import { CryptoOtpGeneratorService } from './infrastructure/services/crypto-otp-generator.service';
import { NodemailerEmailService } from './infrastructure/services/nodemailer-email.service';
import { PrismaMfaChallengeRepository } from './infrastructure/repositories/prisma-mfa-challenge.repository';
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
    LoginUseCase,
    VerifyMfaUseCase,
    ResendMfaUseCase,
    JwtAuthGuard,
    RolesGuard,
    PrismaMfaChallengeRepository,
    { provide: MFA_CHALLENGE_REPOSITORY, useClass: PrismaMfaChallengeRepository },
    { provide: TOKEN_SERVICE_PORT, useClass: JwtTokenService },
    { provide: OTP_GENERATOR_PORT, useClass: CryptoOtpGeneratorService },
    { provide: EMAIL_SERVICE_PORT, useClass: NodemailerEmailService },
  ],
  exports: [JwtAuthGuard, RolesGuard, { provide: TOKEN_SERVICE_PORT, useClass: JwtTokenService }],
})
export class AuthModule {}
