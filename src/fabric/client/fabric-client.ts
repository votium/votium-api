import * as grpc from '@grpc/grpc-js';
import { connect, Contract, Gateway, hash, Network, signers } from '@hyperledger/fabric-gateway';
import { createPrivateKey } from 'node:crypto';
import { FabricConfig } from '../config/fabric.config';
import { FabricCredentials } from '../credentials/credentials.loader';
import { FabricConfigError } from '../errors/fabric-config.error';
import { FabricProfile, SYSTEM_CONTRACT } from '../fabric.constants';

export interface FabricMetadata {
  contracts: Record<string, { transactions?: Array<{ name: string }> }>;
}

export interface FabricPing {
  ok: boolean;
  latencyMs: number;
  reason?: string;
}

/** One gRPC connection + one Gateway per identity. Internal to the fabric module. */
export class FabricClient {
  private grpcClient?: grpc.Client;
  private gateway?: Gateway;
  private network?: Network;

  constructor(
    readonly profile: FabricProfile,
    private readonly credentials: FabricCredentials,
    private readonly config: FabricConfig,
  ) { }

  get mspId(): string {
    return this.credentials.mspId;
  }
  get channel(): string {
    return this.credentials.channel;
  }
  get chaincodes(): string[] {
    return this.credentials.chaincodes;
  }
  get credentialsExpireAt(): Date {
    const a = this.credentials.identity.expiresAt;
    const b = this.credentials.tls.expiresAt;
    return a < b ? a : b;
  }

  connect(): void {
    if (this.gateway) return;
    const c = this.credentials;
    const t = this.config.timeouts;
    this.grpcClient = new grpc.Client(
      c.endpoint,
      grpc.credentials.createSsl(c.tls.peerCa, c.tls.key, c.tls.cert), // mutual TLS
      {
        'grpc.keepalive_time_ms': this.config.keepAliveMs,
        'grpc.keepalive_timeout_ms': 20000,
        'grpc.keepalive_permit_without_calls': 1,
      },
    );
    this.gateway = connect({
      client: this.grpcClient,
      identity: { mspId: c.mspId, credentials: c.identity.certificate },
      signer: signers.newPrivateKeySigner(createPrivateKey(c.identity.privateKey)),
      hash: hash.sha256,
      evaluateOptions: () => ({ deadline: Date.now() + t.evaluateMs }),
      endorseOptions: () => ({ deadline: Date.now() + t.endorseMs }),
      submitOptions: () => ({ deadline: Date.now() + t.submitMs }),
      commitStatusOptions: () => ({ deadline: Date.now() + t.commitStatusMs }),
    });
    this.network = this.gateway.getNetwork(c.channel);
  }

  getContract(chaincode: string, contract?: string): Contract {
    if (!this.network)
      throw new FabricConfigError(`Fabric client "${this.profile}" is not connected`);
    return this.network.getContract(chaincode, contract);
  }

  connectivity(): string {
    if (!this.grpcClient) return 'NOT_CONNECTED';
    return grpc.connectivityState[this.grpcClient.getChannel().getConnectivityState(false)];
  }

  async getMetadata(chaincode: string): Promise<FabricMetadata> {
    const bytes = await this.getContract(chaincode, SYSTEM_CONTRACT).evaluateTransaction(
      'GetMetadata',
    );
    return JSON.parse(new TextDecoder().decode(bytes)) as FabricMetadata;
  }

  async ping(): Promise<FabricPing> {
    const started = Date.now();
    try {
      await this.getMetadata(this.credentials.chaincodes[0]);
      return { ok: true, latencyMs: Date.now() - started };
    } catch (err) {
      const e = err as { code?: number | string };
      return {
        ok: false,
        latencyMs: Date.now() - started,
        reason: `${(err as Error).constructor.name} code=${e.code ?? '-'}`,
      };
    }
  }

  close(): void {
    this.gateway?.close();
    this.grpcClient?.close();
    this.gateway = undefined;
    this.grpcClient = undefined;
    this.network = undefined;
  }
}
