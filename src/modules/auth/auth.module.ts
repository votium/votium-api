import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { envs } from 'src/config';
import { IamModule } from 'src/modules/iam/iam.module';
import { ElectorsModule } from 'src/modules/electors/electors.module';
import { LoginUseCase } from './application/use-cases/login.use-case';
import { VerifyMfaUseCase } from './application/use-cases/verify-mfa.use-case';
import { ResendMfaUseCase } from './application/use-cases/resend-mfa.use-case';
import { LoginElectorUseCase } from './application/use-cases/login-elector.use-case';
import { VerifyElectorMfaUseCase } from './application/use-cases/verify-elector-mfa.use-case';
import { ResendElectorMfaUseCase } from './application/use-cases/resend-elector-mfa.use-case';
import { GetMeElectorUseCase } from './application/use-cases/get-me-elector.use-case';
import { GetMeUserUseCase } from './application/use-cases/get-me-user.use-case';
import { TOKEN_SERVICE_PORT, type TokenServicePort } from './application/ports/token-service.port';
import { OTP_GENERATOR_PORT, type OtpGeneratorPort } from './application/ports/otp-generator.port';
import { EMAIL_SERVICE_PORT, type EmailServicePort } from './application/ports/email-service.port';
import {
  ASYNC_EMAIL_SERVICE_PORT,
  type AsyncEmailServicePort,
} from './application/ports/async-email-service.port';
import { MFA_HASHER_PORT, type MfaHasherPort } from './application/ports/mfa-hasher.port';
import { MFA_CHALLENGE_REPOSITORY } from './domain/repositories/mfa-challenge.repository.interface';
import {
  ELECTOR_MFA_CHALLENGE_REPOSITORY,
  type ElectorMfaChallengeRepository,
} from './domain/repositories/elector-mfa-challenge.repository.interface';
import {
  ELECTOR_REPOSITORY,
  type ElectorRepository,
} from 'src/modules/electors/domain/repositories/elector.repository.interface';
import {
  USER_REPOSITORY,
  type UserRepository,
} from 'src/modules/iam/domain/repositories/user.repository.interface';
import {
  PASSWORD_HASHER_PORT,
  type PasswordHasherPort,
} from 'src/modules/iam/application/ports/password-hasher.port';
import {
  PASSWORD_RECOVERY_EMAIL_PORT,
  type PasswordRecoveryEmailPort,
} from './application/ports/password-recovery-email.port';
import {
  PASSWORD_RECOVERY_CODE_REPOSITORY,
  type PasswordRecoveryCodeRepository,
} from './domain/repositories/password-recovery-code.repository.interface';
import {
  ELECTOR_PASSWORD_RECOVERY_CODE_REPOSITORY,
  type ElectorPasswordRecoveryCodeRepository,
} from './domain/repositories/elector-password-recovery-code.repository.interface';
import { RequestUserPasswordRecoveryUseCase } from './application/use-cases/request-user-password-recovery.use-case';
import { ResetUserPasswordUseCase } from './application/use-cases/reset-user-password.use-case';
import { RequestElectorPasswordRecoveryUseCase } from './application/use-cases/request-elector-password-recovery.use-case';
import { ResetElectorPasswordUseCase } from './application/use-cases/reset-elector-password.use-case';
import { PrismaPasswordRecoveryCodeRepository } from './infrastructure/repositories/prisma-password-recovery-code.repository';
import { PrismaElectorPasswordRecoveryCodeRepository } from './infrastructure/repositories/prisma-elector-password-recovery-code.repository';
import { JwtTokenService } from './infrastructure/services/jwt-token.service';
import { CryptoOtpGeneratorService } from './infrastructure/services/crypto-otp-generator.service';
import { NodemailerEmailService } from './infrastructure/services/nodemailer-email.service';
import { AsyncNodemailerEmailService } from './infrastructure/services/async-nodemailer-email.service';
import { Sha256MfaHasherService } from './infrastructure/services/sha256-mfa-hasher.service';
import { PrismaMfaChallengeRepository } from './infrastructure/repositories/prisma-mfa-challenge.repository';
import { PrismaElectorMfaChallengeRepository } from './infrastructure/repositories/prisma-elector-mfa-challenge.repository';
import { JwtAuthGuard } from './presentation/guards/jwt-auth.guard';
import { RolesGuard } from './presentation/guards/roles.guard';
import { ElectorGuard } from './presentation/guards/elector.guard';
import { BallotAccessGuard } from './presentation/guards/ballot-access.guard';
import { AuthController } from './presentation/controllers/auth.controller';
import { ElectorAuthController } from './presentation/controllers/elector-auth.controller';
import { AuthCookieService } from './presentation/services/auth-cookie.service';

@Module({
  imports: [
    forwardRef(() => IamModule),
    forwardRef(() => ElectorsModule),
    JwtModule.register({
      secret: envs.jwtSecret,
      signOptions: { expiresIn: envs.jwtExpiresIn },
    }),
  ],
  controllers: [AuthController, ElectorAuthController],
  providers: [
    LoginUseCase,
    VerifyMfaUseCase,
    ResendMfaUseCase,
    JwtAuthGuard,
    RolesGuard,
    ElectorGuard,
    BallotAccessGuard,
    AuthCookieService,
    PrismaMfaChallengeRepository,
    { provide: MFA_CHALLENGE_REPOSITORY, useClass: PrismaMfaChallengeRepository },
    { provide: ELECTOR_MFA_CHALLENGE_REPOSITORY, useClass: PrismaElectorMfaChallengeRepository },
    { provide: TOKEN_SERVICE_PORT, useClass: JwtTokenService },
    { provide: OTP_GENERATOR_PORT, useClass: CryptoOtpGeneratorService },
    { provide: EMAIL_SERVICE_PORT, useClass: NodemailerEmailService },
    { provide: MFA_HASHER_PORT, useClass: Sha256MfaHasherService },
    {
      provide: ASYNC_EMAIL_SERVICE_PORT,
      useFactory: (emailService: EmailServicePort) => new AsyncNodemailerEmailService(emailService),
      inject: [EMAIL_SERVICE_PORT],
    },
    {
      provide: LoginElectorUseCase,
      useFactory: (
        electors: ElectorRepository,
        hasher: PasswordHasherPort,
        challenges: ElectorMfaChallengeRepository,
        otpGenerator: OtpGeneratorPort,
        mfaHasher: MfaHasherPort,
        emailService: AsyncEmailServicePort,
      ) =>
        new LoginElectorUseCase(
          electors,
          hasher,
          challenges,
          otpGenerator,
          mfaHasher,
          emailService,
        ),
      inject: [
        ELECTOR_REPOSITORY,
        PASSWORD_HASHER_PORT,
        ELECTOR_MFA_CHALLENGE_REPOSITORY,
        OTP_GENERATOR_PORT,
        MFA_HASHER_PORT,
        ASYNC_EMAIL_SERVICE_PORT,
      ],
    },
    {
      provide: VerifyElectorMfaUseCase,
      useFactory: (
        challenges: ElectorMfaChallengeRepository,
        electors: ElectorRepository,
        mfaHasher: MfaHasherPort,
        tokens: TokenServicePort,
      ) => new VerifyElectorMfaUseCase(challenges, electors, mfaHasher, tokens),
      inject: [
        ELECTOR_MFA_CHALLENGE_REPOSITORY,
        ELECTOR_REPOSITORY,
        MFA_HASHER_PORT,
        TOKEN_SERVICE_PORT,
      ],
    },
    {
      provide: ResendElectorMfaUseCase,
      useFactory: (
        challenges: ElectorMfaChallengeRepository,
        electors: ElectorRepository,
        otpGenerator: OtpGeneratorPort,
        mfaHasher: MfaHasherPort,
        emailService: AsyncEmailServicePort,
      ) => new ResendElectorMfaUseCase(challenges, electors, otpGenerator, mfaHasher, emailService),
      inject: [
        ELECTOR_MFA_CHALLENGE_REPOSITORY,
        ELECTOR_REPOSITORY,
        OTP_GENERATOR_PORT,
        MFA_HASHER_PORT,
        ASYNC_EMAIL_SERVICE_PORT,
      ],
    },
    { provide: PASSWORD_RECOVERY_CODE_REPOSITORY, useClass: PrismaPasswordRecoveryCodeRepository },
    {
      provide: ELECTOR_PASSWORD_RECOVERY_CODE_REPOSITORY,
      useClass: PrismaElectorPasswordRecoveryCodeRepository,
    },
    // Same Nodemailer instance as EMAIL_SERVICE_PORT; a dedicated token keeps EmailServicePort intact.
    { provide: PASSWORD_RECOVERY_EMAIL_PORT, useExisting: EMAIL_SERVICE_PORT },
    {
      provide: RequestUserPasswordRecoveryUseCase,
      useFactory: (
        users: UserRepository,
        recovery: PasswordRecoveryCodeRepository,
        otpGenerator: OtpGeneratorPort,
        mfaHasher: MfaHasherPort,
        email: PasswordRecoveryEmailPort,
      ) => new RequestUserPasswordRecoveryUseCase(users, recovery, otpGenerator, mfaHasher, email),
      inject: [
        USER_REPOSITORY,
        PASSWORD_RECOVERY_CODE_REPOSITORY,
        OTP_GENERATOR_PORT,
        MFA_HASHER_PORT,
        PASSWORD_RECOVERY_EMAIL_PORT,
      ],
    },
    {
      provide: ResetUserPasswordUseCase,
      useFactory: (
        users: UserRepository,
        recovery: PasswordRecoveryCodeRepository,
        mfaHasher: MfaHasherPort,
        passwordHasher: PasswordHasherPort,
      ) => new ResetUserPasswordUseCase(users, recovery, mfaHasher, passwordHasher),
      inject: [
        USER_REPOSITORY,
        PASSWORD_RECOVERY_CODE_REPOSITORY,
        MFA_HASHER_PORT,
        PASSWORD_HASHER_PORT,
      ],
    },
    {
      provide: RequestElectorPasswordRecoveryUseCase,
      useFactory: (
        electors: ElectorRepository,
        recovery: ElectorPasswordRecoveryCodeRepository,
        otpGenerator: OtpGeneratorPort,
        mfaHasher: MfaHasherPort,
        email: PasswordRecoveryEmailPort,
      ) =>
        new RequestElectorPasswordRecoveryUseCase(
          electors,
          recovery,
          otpGenerator,
          mfaHasher,
          email,
        ),
      inject: [
        ELECTOR_REPOSITORY,
        ELECTOR_PASSWORD_RECOVERY_CODE_REPOSITORY,
        OTP_GENERATOR_PORT,
        MFA_HASHER_PORT,
        PASSWORD_RECOVERY_EMAIL_PORT,
      ],
    },
    {
      provide: ResetElectorPasswordUseCase,
      useFactory: (
        electors: ElectorRepository,
        recovery: ElectorPasswordRecoveryCodeRepository,
        mfaHasher: MfaHasherPort,
        passwordHasher: PasswordHasherPort,
      ) => new ResetElectorPasswordUseCase(electors, recovery, mfaHasher, passwordHasher),
      inject: [
        ELECTOR_REPOSITORY,
        ELECTOR_PASSWORD_RECOVERY_CODE_REPOSITORY,
        MFA_HASHER_PORT,
        PASSWORD_HASHER_PORT,
      ],
    },
    {
      provide: GetMeElectorUseCase,
      useFactory: (electors: ElectorRepository) => new GetMeElectorUseCase(electors),
      inject: [ELECTOR_REPOSITORY],
    },
    {
      provide: GetMeUserUseCase,
      useFactory: (users: UserRepository) => new GetMeUserUseCase(users),
      inject: [USER_REPOSITORY],
    },
  ],
  exports: [
    JwtAuthGuard,
    RolesGuard,
    ElectorGuard,
    BallotAccessGuard,
    AuthCookieService,
    { provide: TOKEN_SERVICE_PORT, useClass: JwtTokenService },
    { provide: OTP_GENERATOR_PORT, useClass: CryptoOtpGeneratorService },
    { provide: EMAIL_SERVICE_PORT, useClass: NodemailerEmailService },
  ],
})
export class AuthModule {}
