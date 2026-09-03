import { Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { IamModule } from 'src/modules/iam/iam.module';
import {
  PASSWORD_HASHER_PORT,
  type PasswordHasherPort,
} from 'src/modules/iam/application/ports/password-hasher.port';
import {
  AUDIT_LOG_PORT,
  type AuditLogPort,
} from 'src/modules/iam/application/ports/audit-log.port';
import {
  TOKEN_SERVICE_PORT,
  type TokenServicePort,
} from 'src/modules/auth/application/ports/token-service.port';
import {
  OTP_GENERATOR_PORT,
  type OtpGeneratorPort,
} from 'src/modules/auth/application/ports/otp-generator.port';
import {
  EMAIL_SERVICE_PORT,
  type EmailServicePort,
} from 'src/modules/auth/application/ports/email-service.port';
import { DeactivateElectorUseCase } from './application/use-cases/deactivate-elector.use-case';
import { ImportElectoralRegistryUseCase } from './application/use-cases/import-electoral-registry.use-case';
import { LoginElectorUseCase } from './application/use-cases/login-elector.use-case';
import { VerifyElectorMfaUseCase } from './application/use-cases/verify-elector-mfa.use-case';
import { ResendElectorMfaUseCase } from './application/use-cases/resend-elector-mfa.use-case';
import { SearchElectorsUseCase } from './application/use-cases/search-electors.use-case';
import { CSV_PARSER_PORT, type CsvParserPort } from './application/ports/csv-parser.port';
import {
  ELECTOR_REPOSITORY,
  type ElectorRepository,
} from './domain/repositories/elector.repository.interface';
import {
  ELECTOR_MFA_CHALLENGE_REPOSITORY,
  type ElectorMfaChallengeRepository,
} from './domain/repositories/elector-mfa-challenge.repository.interface';
import { CsvFileParserService } from './infrastructure/services/csv-file-parser.service';
import { PrismaElectorRepository } from './infrastructure/repositories/prisma-elector.repository';
import { PrismaElectorMfaChallengeRepository } from './infrastructure/repositories/prisma-elector-mfa-challenge.repository';
import { ElectorsController } from './presentation/controllers/electors.controller';
import { ElectorAuthController } from './presentation/controllers/elector-auth.controller';

@Module({
  imports: [IamModule, AuthModule],
  controllers: [ElectorsController, ElectorAuthController],
  providers: [
    { provide: ELECTOR_REPOSITORY, useClass: PrismaElectorRepository },
    {
      provide: ELECTOR_MFA_CHALLENGE_REPOSITORY,
      useClass: PrismaElectorMfaChallengeRepository,
    },
    { provide: CSV_PARSER_PORT, useClass: CsvFileParserService },
    {
      provide: ImportElectoralRegistryUseCase,
      useFactory: (
        parser: CsvParserPort,
        electors: ElectorRepository,
        hasher: PasswordHasherPort,
      ) => new ImportElectoralRegistryUseCase(parser, electors, hasher),
      inject: [CSV_PARSER_PORT, ELECTOR_REPOSITORY, PASSWORD_HASHER_PORT],
    },
    {
      provide: DeactivateElectorUseCase,
      useFactory: (electors: ElectorRepository, audit: AuditLogPort) =>
        new DeactivateElectorUseCase(electors, audit),
      inject: [ELECTOR_REPOSITORY, AUDIT_LOG_PORT],
    },
    {
      provide: SearchElectorsUseCase,
      useFactory: (electors: ElectorRepository) => new SearchElectorsUseCase(electors),
      inject: [ELECTOR_REPOSITORY],
    },
    {
      provide: LoginElectorUseCase,
      useFactory: (
        electors: ElectorRepository,
        hasher: PasswordHasherPort,
        challenges: ElectorMfaChallengeRepository,
        otpGenerator: OtpGeneratorPort,
        emailService: EmailServicePort,
      ) => new LoginElectorUseCase(electors, hasher, challenges, otpGenerator, emailService),
      inject: [
        ELECTOR_REPOSITORY,
        PASSWORD_HASHER_PORT,
        ELECTOR_MFA_CHALLENGE_REPOSITORY,
        OTP_GENERATOR_PORT,
        EMAIL_SERVICE_PORT,
      ],
    },
    {
      provide: VerifyElectorMfaUseCase,
      useFactory: (
        challenges: ElectorMfaChallengeRepository,
        electors: ElectorRepository,
        hasher: PasswordHasherPort,
        tokens: TokenServicePort,
      ) => new VerifyElectorMfaUseCase(challenges, electors, hasher, tokens),
      inject: [
        ELECTOR_MFA_CHALLENGE_REPOSITORY,
        ELECTOR_REPOSITORY,
        PASSWORD_HASHER_PORT,
        TOKEN_SERVICE_PORT,
      ],
    },
    {
      provide: ResendElectorMfaUseCase,
      useFactory: (
        challenges: ElectorMfaChallengeRepository,
        electors: ElectorRepository,
        otpGenerator: OtpGeneratorPort,
        hasher: PasswordHasherPort,
        emailService: EmailServicePort,
      ) => new ResendElectorMfaUseCase(challenges, electors, otpGenerator, hasher, emailService),
      inject: [
        ELECTOR_MFA_CHALLENGE_REPOSITORY,
        ELECTOR_REPOSITORY,
        OTP_GENERATOR_PORT,
        PASSWORD_HASHER_PORT,
        EMAIL_SERVICE_PORT,
      ],
    },
  ],
})
export class ElectorsModule {}
