import { IsArray, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import {
  AUDIT_LOGS_BLOCKCHAIN_STATUS_VALUES,
  type AuditLogsBlockchainStatusType,
} from '../../domain/value-objects/audit-logs-blockchain-status.vo';

export class UpdateLogBlockchainActionDto {
  @IsNumber()
  @IsNotEmpty()
  id!: number;

  @IsString()
  @IsNotEmpty()
  @IsIn(AUDIT_LOGS_BLOCKCHAIN_STATUS_VALUES)
  status!: AuditLogsBlockchainStatusType;

  @IsOptional()
  @IsArray()
  transactions?: Record<string, unknown>[];
}
