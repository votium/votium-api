import { Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { IamModule } from 'src/modules/iam/iam.module';
import {
  AUDIT_LOG_PORT,
  type AuditLogPort,
} from 'src/modules/iam/application/ports/audit-log.port';
import { RegisterCandidateUseCase } from './application/use-cases/register-candidate.use-case';
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
  ],
})
export class CandidatesModule {}
