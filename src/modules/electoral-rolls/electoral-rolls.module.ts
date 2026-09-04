import { Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { ElectionsModule } from 'src/modules/elections/elections.module';
import { ElectorsModule } from 'src/modules/electors/electors.module';
import { IamModule } from 'src/modules/iam/iam.module';
import {
  AUDIT_LOG_PORT,
  type AuditLogPort,
} from 'src/modules/iam/application/ports/audit-log.port';
import {
  ELECTOR_REPOSITORY,
  type ElectorRepository,
} from 'src/modules/electors/domain/repositories/elector.repository.interface';
import {
  ELECTION_REPOSITORY,
  type ElectionRepository,
} from 'src/modules/elections/domain/repositories/election.repository.interface';
import { BulkRegisterElectoralRollUseCase } from './application/use-cases/bulk-register-electoral-roll.use-case';
import {
  ELECTORAL_ROLL_CSV_PARSER_PORT,
  type ElectoralRollCsvParserPort,
} from './application/ports/electoral-roll-csv-parser.port';
import {
  ELECTORAL_ROLL_REPOSITORY,
  type ElectoralRollRepository,
} from './domain/repositories/electoral-roll.repository.interface';
import { PrismaElectoralRollRepository } from './infrastructure/repositories/prisma-electoral-roll.repository';
import { ElectoralRollCsvFileParserService } from './infrastructure/services/electoral-roll-csv-file-parser.service';
import { ElectoralRollsController } from './presentation/controllers/electoral-rolls.controller';

@Module({
  imports: [IamModule, AuthModule, ElectionsModule, ElectorsModule],
  controllers: [ElectoralRollsController],
  providers: [
    { provide: ELECTORAL_ROLL_REPOSITORY, useClass: PrismaElectoralRollRepository },
    { provide: ELECTORAL_ROLL_CSV_PARSER_PORT, useClass: ElectoralRollCsvFileParserService },
    {
      provide: BulkRegisterElectoralRollUseCase,
      useFactory: (
        parser: ElectoralRollCsvParserPort,
        electionRepo: ElectionRepository,
        electorRepo: ElectorRepository,
        electoralRollRepo: ElectoralRollRepository,
        audit: AuditLogPort,
      ) =>
        new BulkRegisterElectoralRollUseCase(
          parser,
          electionRepo,
          electorRepo,
          electoralRollRepo,
          audit,
        ),
      inject: [
        ELECTORAL_ROLL_CSV_PARSER_PORT,
        ELECTION_REPOSITORY,
        ELECTOR_REPOSITORY,
        ELECTORAL_ROLL_REPOSITORY,
        AUDIT_LOG_PORT,
      ],
    },
  ],
})
export class ElectoralRollsModule {}
