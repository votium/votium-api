import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { type ConfigType } from '@nestjs/config';
import { fabricConfig } from '../config/fabric.config';
import { loadCredentials } from '../credentials/credentials.loader';
import { FabricConfigError } from '../errors/fabric-config.error';
import { FabricProfile } from '../fabric.constants';
import { FabricClient } from './fabric-client';

const DAY_MS = 86_400_000;

@Injectable()
export class FabricClientRegistry implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FabricClientRegistry.name);
  private readonly clients = new Map<FabricProfile, FabricClient>();

  constructor(@Inject(fabricConfig.KEY) private readonly config: ConfigType<typeof fabricConfig>) {}

  onModuleInit(): void {
    // Invalid credentials abort the application start on purpose (fail fast).
    this.add('writer', this.config.writerDir);
    if (this.config.auditorDir) this.add('auditor', this.config.auditorDir);
    // gRPC connects lazily: an unreachable peer must not prevent the application from starting.
    for (const client of this.clients.values()) void this.probe(client);
  }

  onModuleDestroy(): void {
    for (const client of this.clients.values()) client.close();
    this.clients.clear();
  }

  get(profile: FabricProfile): FabricClient {
    const client = this.clients.get(profile);
    if (!client) throw new FabricConfigError(`Fabric profile "${profile}" is not configured`);
    return client;
  }

  profiles(): FabricProfile[] {
    return [...this.clients.keys()];
  }

  private add(profile: FabricProfile, dir: string): void {
    const client = new FabricClient(profile, loadCredentials(dir), this.config);
    client.connect();
    this.clients.set(profile, client);
    const days = Math.floor((client.credentialsExpireAt.getTime() - Date.now()) / DAY_MS);
    this.logger.log(
      `Profile "${profile}" ready (msp=${client.mspId}, channel=${client.channel}, credentials valid ${days} days)`,
    );
    if (days < 30)
      this.logger.warn(`Profile "${profile}": credentials expire in ${days} days; renew them`);
  }

  private async probe(client: FabricClient): Promise<void> {
    const ping = await client.ping();
    if (ping.ok) this.logger.log(`Profile "${client.profile}" reachable (${ping.latencyMs} ms)`);
    else this.logger.warn(`Profile "${client.profile}" not reachable yet (${ping.reason})`);
  }
}
