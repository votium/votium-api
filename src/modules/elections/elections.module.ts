import { Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { IamModule } from 'src/modules/iam/iam.module';
import {
  AUDIT_LOG_PORT,
  type AuditLogPort,
} from 'src/modules/iam/application/ports/audit-log.port';
import { CreateElectionUseCase } from './application/use-cases/create-election.use-case';
import { GetElectionsUseCase } from './application/use-cases/get-elections.use-case';
import { UpdateElectionUseCase } from './application/use-cases/update-election.use-case';
import { DeleteElectionUseCase } from './application/use-cases/delete-election.use-case';
import {
  ELECTION_REPOSITORY,
  type ElectionRepository,
} from './domain/repositories/election.repository.interface';
import { PrismaElectionRepository } from './infrastructure/repositories/prisma-election.repository';
import { ElectionsController } from './presentation/controllers/elections.controller';

@Module({
  imports: [IamModule, AuthModule],
  controllers: [ElectionsController],
  providers: [
    { provide: ELECTION_REPOSITORY, useClass: PrismaElectionRepository },
    {
      provide: CreateElectionUseCase,
      useFactory: (elections: ElectionRepository, audit: AuditLogPort) =>
        new CreateElectionUseCase(elections, audit),
      inject: [ELECTION_REPOSITORY, AUDIT_LOG_PORT],
    },
    {
      provide: GetElectionsUseCase,
      useFactory: (elections: ElectionRepository) => new GetElectionsUseCase(elections),
      inject: [ELECTION_REPOSITORY],
    },
    {
      provide: UpdateElectionUseCase,
      useFactory: (elections: ElectionRepository, audit: AuditLogPort) =>
        new UpdateElectionUseCase(elections, audit),
      inject: [ELECTION_REPOSITORY, AUDIT_LOG_PORT],
    },
    {
      provide: DeleteElectionUseCase,
      useFactory: (elections: ElectionRepository, audit: AuditLogPort) =>
        new DeleteElectionUseCase(elections, audit),
      inject: [ELECTION_REPOSITORY, AUDIT_LOG_PORT],
    },
  ],
  exports: [ELECTION_REPOSITORY],
})
export class ElectionsModule {}
