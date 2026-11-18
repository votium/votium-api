import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import {
  AUDIT_LOGS_BLOCKCHAIN_STATUS_VALUES,
  type AuditLogsBlockchainStatusType,
} from '../../domain/value-objects/audit-logs-blockchain-status.vo';

export class RegisterLogBlockchainActionDto {
  @IsString()
  @IsNotEmpty()
  actorId!: string;

  @IsString()
  @IsNotEmpty()
  actionType!: string;

  @IsString()
  @IsNotEmpty()
  entityType!: string;

  @IsString()
  @IsNotEmpty()
  entityId!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(AUDIT_LOGS_BLOCKCHAIN_STATUS_VALUES)
  status!: AuditLogsBlockchainStatusType;

  @IsNotEmpty()
  details!: Record<string, unknown>;
}
