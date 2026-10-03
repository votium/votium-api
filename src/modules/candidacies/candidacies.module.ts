import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { IamModule } from 'src/modules/iam/iam.module';
import {
  AUDIT_LOG_PORT,
  type AuditLogPort,
} from 'src/modules/iam/application/ports/audit-log.port';
import {
  CANDIDATE_REPOSITORY,
  type CandidateRepository,
} from 'src/modules/candidates/domain/repositories/candidate.repository.interface';
import {
  ELECTION_REPOSITORY,
  type ElectionRepository,
} from 'src/modules/elections/domain/repositories/election.repository.interface';
import { CandidatesModule } from 'src/modules/candidates/candidates.module';
import { ElectionsModule } from 'src/modules/elections/elections.module';
import { DeleteCandidacyUseCase } from './application/use-cases/delete-candidacy.use-case';
import { GetElectionBallotUseCase } from './application/use-cases/get-election-ballot.use-case';
import { GetElectionCandidaciesUseCase } from './application/use-cases/get-election-candidacies.use-case';
import { RegisterCandidacyUseCase } from './application/use-cases/register-candidacy.use-case';
import { UpdateCandidacyUseCase } from './application/use-cases/update-candidacy.use-case';
import {
  CANDIDACY_REPOSITORY,
  type CandidacyRepository,
} from './domain/repositories/candidacy.repository.interface';
import { PrismaCandidacyRepository } from './infrastructure/repositories/prisma-candidacy.repository';
import { BallotController } from './presentation/controllers/ballot.controller';
import { CandidaciesController } from './presentation/controllers/candidacies.controller';
import { ElectionCandidaciesController } from './presentation/controllers/election-candidacies.controller';

@Module({
  imports: [
    IamModule,
    AuthModule,
    forwardRef(() => ElectionsModule),
    forwardRef(() => CandidatesModule),
  ],
  controllers: [CandidaciesController, ElectionCandidaciesController, BallotController],
  providers: [
    { provide: CANDIDACY_REPOSITORY, useClass: PrismaCandidacyRepository },
    {
      provide: RegisterCandidacyUseCase,
      useFactory: (
        candidates: CandidateRepository,
        elections: ElectionRepository,
        candidacies: CandidacyRepository,
        audit: AuditLogPort,
      ) => new RegisterCandidacyUseCase(candidates, elections, candidacies, audit),
      inject: [CANDIDATE_REPOSITORY, ELECTION_REPOSITORY, CANDIDACY_REPOSITORY, AUDIT_LOG_PORT],
    },
    {
      provide: GetElectionCandidaciesUseCase,
      useFactory: (elections: ElectionRepository, candidacies: CandidacyRepository) =>
        new GetElectionCandidaciesUseCase(elections, candidacies),
      inject: [ELECTION_REPOSITORY, CANDIDACY_REPOSITORY],
    },
    {
      provide: GetElectionBallotUseCase,
      useFactory: (elections: ElectionRepository, candidacies: CandidacyRepository) =>
        new GetElectionBallotUseCase(elections, candidacies),
      inject: [ELECTION_REPOSITORY, CANDIDACY_REPOSITORY],
    },
    {
      provide: UpdateCandidacyUseCase,
      useFactory: (
        elections: ElectionRepository,
        candidacies: CandidacyRepository,
        audit: AuditLogPort,
      ) => new UpdateCandidacyUseCase(elections, candidacies, audit),
      inject: [ELECTION_REPOSITORY, CANDIDACY_REPOSITORY, AUDIT_LOG_PORT],
    },
    {
      provide: DeleteCandidacyUseCase,
      useFactory: (
        elections: ElectionRepository,
        candidacies: CandidacyRepository,
        audit: AuditLogPort,
      ) => new DeleteCandidacyUseCase(elections, candidacies, audit),
      inject: [ELECTION_REPOSITORY, CANDIDACY_REPOSITORY, AUDIT_LOG_PORT],
    },
  ],
  exports: [CANDIDACY_REPOSITORY],
})
export class CandidaciesModule {}
