import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppController } from './app.controller';
import { IamModule } from './modules/iam/iam.module';
import { AuthModule } from './modules/auth/auth.module';
import { ElectorsModule } from './modules/electors/electors.module';
import { CandidatesModule } from './modules/candidates/candidates.module';
import { ElectionsModule } from './modules/elections/elections.module';
import { CandidaciesModule } from './modules/candidacies/candidacies.module';
import { VotingModule } from './modules/voting/voting.module';
import { AnonymousVotingModule } from './modules/anonymous-voting/anonymous-voting.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { FabricModule } from './fabric';
import { BlindSignatureModule } from './shared/blind-signature/blind-signature.module';
import { ConfigModule } from '@nestjs/config';
import { SharedModule } from './shared/shared.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    SharedModule,
    IamModule,
    AuthModule,
    ElectorsModule,
    CandidatesModule,
    ElectionsModule,
    CandidaciesModule,
    VotingModule,
    AnonymousVotingModule,
    DashboardModule,
    FabricModule,
    BlindSignatureModule,
  ],
  controllers: [AppController],
  providers: [],
})
export class AppModule {}
