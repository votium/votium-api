import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FabricClientRegistry } from './client/fabric-client.registry';
import { fabricConfig } from './config/fabric.config';
import { FabricHealthService } from './health/fabric-health.service';

@Module({
  imports: [ConfigModule.forFeature(fabricConfig)],
  providers: [FabricClientRegistry, FabricHealthService],
  exports: [FabricClientRegistry, FabricHealthService],
})
export class FabricModule { }
