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
  VOTE_REPOSITORY,
  type VoteRepository,
} from './domain/repositories/vote.repository.interface';
import { PrismaVoteRepository } from './infrastructure/repositories/prisma-vote.repository';
import { VotesController } from './presentation/controllers/votes.controller';

@Module({
  imports: [IamModule, AuthModule, ElectionsModule, CandidaciesModule, ElectoralRollsModule],
  controllers: [VotesController],
  providers: [
    { provide: VOTE_REPOSITORY, useClass: PrismaVoteRepository },
    {
      provide: RegisterVoteUseCase,
      useFactory: (
        elections: ElectionRepository,
        electoralRolls: ElectoralRollRepository,
        candidacies: CandidacyRepository,
        votes: VoteRepository,
      ) => new RegisterVoteUseCase(elections, electoralRolls, candidacies, votes),
      inject: [
        ELECTION_REPOSITORY,
        ELECTORAL_ROLL_REPOSITORY,
        CANDIDACY_REPOSITORY,
        VOTE_REPOSITORY,
      ],
    },
  ],
})
export class VotingModule {}
