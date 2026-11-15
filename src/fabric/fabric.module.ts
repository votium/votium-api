import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { FabricClientRegistry } from './client/fabric-client.registry';
import { FabricInvoker } from './client/fabric-invoker';
import { fabricConfig } from './config/fabric.config';
import { FabricExceptionFilter } from './errors/fabric-exception.filter';
import { FabricHealthService } from './health/fabric-health.service';
import { CandidatesService } from './services/candidates.service';
import { ElectionsService } from './services/elections.service';
import { VotersService } from './services/voters.service';
import { VotingService } from './services/voting.service';

@Module({
  imports: [ConfigModule.forFeature(fabricConfig)],
  providers: [
    FabricClientRegistry,
    FabricInvoker,
    FabricHealthService,
    ElectionsService,
    CandidatesService,
    VotersService,
    VotingService,
    // Global, but it only catches FabricError.
    { provide: APP_FILTER, useClass: FabricExceptionFilter },
  ],
  exports: [FabricHealthService, ElectionsService, CandidatesService, VotersService, VotingService],
})
export class FabricModule {}
