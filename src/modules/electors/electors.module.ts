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
import { DeactivateElectorUseCase } from './application/use-cases/deactivate-elector.use-case';
import { ImportElectoralRegistryUseCase } from './application/use-cases/import-electoral-registry.use-case';
import { CSV_PARSER_PORT, type CsvParserPort } from './application/ports/csv-parser.port';
import {
  ELECTOR_REPOSITORY,
  type ElectorRepository,
} from './domain/repositories/elector.repository.interface';
import { CsvFileParserService } from './infrastructure/services/csv-file-parser.service';
import { PrismaElectorRepository } from './infrastructure/repositories/prisma-elector.repository';
import { ElectorsController } from './presentation/controllers/electors.controller';

@Module({
  imports: [IamModule, AuthModule],
  controllers: [ElectorsController],
  providers: [
    { provide: ELECTOR_REPOSITORY, useClass: PrismaElectorRepository },
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
  ],
})
export class ElectorsModule {}
