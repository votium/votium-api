// Public surface of the module. Nothing from @hyperledger/fabric-gateway or @grpc/grpc-js leaves it.
export { FabricModule } from './fabric.module';
export { FabricHealthService } from './health/fabric-health.service';
export type { FabricHealth, FabricProfileHealth } from './health/fabric-health.service';
