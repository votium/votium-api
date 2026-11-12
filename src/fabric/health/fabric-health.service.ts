import { Injectable } from '@nestjs/common';
import { FabricClientRegistry } from '../client/fabric-client.registry';

export interface FabricProfileHealth {
  profile: string;
  ok: boolean;
  latencyMs: number;
  connectivity: string;
  credentialsDaysLeft: number;
}
export interface FabricHealth {
  ok: boolean;
  profiles: FabricProfileHealth[];
}

@Injectable()
export class FabricHealthService {
  private cache?: { at: number; value: FabricHealth };

  constructor(private readonly registry: FabricClientRegistry) {}

  async check(maxAgeMs = 10_000): Promise<FabricHealth> {
    if (this.cache && Date.now() - this.cache.at < maxAgeMs) return this.cache.value;
    const profiles = await Promise.all(
      this.registry.profiles().map(async (name): Promise<FabricProfileHealth> => {
        const client = this.registry.get(name);
        const ping = await client.ping();
        return {
          profile: name,
          ok: ping.ok,
          latencyMs: ping.latencyMs,
          connectivity: client.connectivity(),
          credentialsDaysLeft: Math.floor(
            (client.credentialsExpireAt.getTime() - Date.now()) / 86_400_000,
          ),
        };
      }),
    );
    const value = { ok: profiles.every((p) => p.ok), profiles };
    this.cache = { at: Date.now(), value };
    return value;
  }
}
