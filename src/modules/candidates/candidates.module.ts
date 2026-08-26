import { Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { IamModule } from 'src/modules/iam/iam.module';
import {
  AUDIT_LOG_PORT,
  type AuditLogPort,
} from 'src/modules/iam/application/ports/audit-log.port';
import { DeactivateCandidateUseCase } from './application/use-cases/deactivate-candidate.use-case';
import { ReactivateCandidateUseCase } from './application/use-cases/reactivate-candidate.use-case';
import { RegisterCandidateUseCase } from './application/use-cases/register-candidate.use-case';
import { SearchCandidatesUseCase } from './application/use-cases/search-candidates.use-case';
import { UpdateCandidateUseCase } from './application/use-cases/update-candidate.use-case';
import {
  CANDIDATE_REPOSITORY,
  type CandidateRepository,
} from './domain/repositories/candidate.repository.interface';
import { PrismaCandidateRepository } from './infrastructure/repositories/prisma-candidate.repository';
import { CandidatesController } from './presentation/controllers/candidates.controller';

@Module({
  imports: [IamModule, AuthModule],
  controllers: [CandidatesController],
  providers: [
    { provide: CANDIDATE_REPOSITORY, useClass: PrismaCandidateRepository },
    {
      provide: RegisterCandidateUseCase,
      useFactory: (candidates: CandidateRepository, audit: AuditLogPort) =>
        new RegisterCandidateUseCase(candidates, audit),
      inject: [CANDIDATE_REPOSITORY, AUDIT_LOG_PORT],
    },
    {
      provide: SearchCandidatesUseCase,
      useFactory: (candidates: CandidateRepository) => new SearchCandidatesUseCase(candidates),
      inject: [CANDIDATE_REPOSITORY],
    },
    {
      provide: DeactivateCandidateUseCase,
      useFactory: (candidates: CandidateRepository, audit: AuditLogPort) =>
        new DeactivateCandidateUseCase(candidates, audit),
      inject: [CANDIDATE_REPOSITORY, AUDIT_LOG_PORT],
    },
    {
      provide: ReactivateCandidateUseCase,
      useFactory: (candidates: CandidateRepository, audit: AuditLogPort) =>
        new ReactivateCandidateUseCase(candidates, audit),
      inject: [CANDIDATE_REPOSITORY, AUDIT_LOG_PORT],
    },
    {
      provide: UpdateCandidateUseCase,
      useFactory: (candidates: CandidateRepository, audit: AuditLogPort) =>
        new UpdateCandidateUseCase(candidates, audit),
      inject: [CANDIDATE_REPOSITORY, AUDIT_LOG_PORT],
    },
  ],
})
export class CandidatesModule {}
