import { Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth/auth.module';
import { CandidaciesModule } from 'src/modules/candidacies/candidacies.module';
import { ElectionsModule } from 'src/modules/elections/elections.module';
import { ElectoralRollsModule } from 'src/modules/electoral-rolls/electoral-rolls.module';
import { IamModule } from 'src/modules/iam/iam.module';
import {
  CANDIDACY_REPOSITORY,
  type CandidacyRepository,
} from 'src/modules/candidacies/domain/repositories/candidacy.repository.interface';
import {
  ELECTION_REPOSITORY,
  type ElectionRepository,
} from 'src/modules/elections/domain/repositories/election.repository.interface';
import {
  ELECTORAL_ROLL_REPOSITORY,
  type ElectoralRollRepository,
} from 'src/modules/electoral-rolls/domain/repositories/electoral-roll.repository.interface';
import { RegisterVoteUseCase } from './application/use-cases/register-vote.use-case';
import {
  RESULT_REPOSITORY,
  type ResultRepository,
} from './domain/repositories/result.repository.interface';
import { PrismaResultRepository } from './infrastructure/repositories/prisma-result.repository';
import { VotesController } from './presentation/controllers/votes.controller';

@Module({
  imports: [IamModule, AuthModule, ElectionsModule, CandidaciesModule, ElectoralRollsModule],
  controllers: [VotesController],
  providers: [
    { provide: RESULT_REPOSITORY, useClass: PrismaResultRepository },
    {
      provide: RegisterVoteUseCase,
      useFactory: (
        elections: ElectionRepository,
        electoralRolls: ElectoralRollRepository,
        candidacies: CandidacyRepository,
        results: ResultRepository,
      ) => new RegisterVoteUseCase(elections, electoralRolls, candidacies, results),
      inject: [
        ELECTION_REPOSITORY,
        ELECTORAL_ROLL_REPOSITORY,
        CANDIDACY_REPOSITORY,
        RESULT_REPOSITORY,
      ],
    },
  ],
})
export class VotingModule {}
