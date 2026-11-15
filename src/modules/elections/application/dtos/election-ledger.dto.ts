import { Type } from 'class-transformer';
import { IsIn, IsNotEmpty, IsOptional, IsString, Matches, ValidateNested } from 'class-validator';
import {
  ELECTION_STATUS_VALUES,
  type ElectionStatusType,
} from '../../domain/value-objects/election-status.vo';

export const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/;

export class ElectionTimelineDto {
  @IsString()
  @Matches(ISO_DATETIME_RE)
  createdAt!: string;

  @IsOptional()
  @IsString()
  @Matches(ISO_DATETIME_RE)
  startedAt?: string;

  @IsOptional()
  @IsString()
  @Matches(ISO_DATETIME_RE)
  closedAt?: string;

  @IsOptional()
  @IsString()
  @Matches(ISO_DATETIME_RE)
  publishedAt?: string;

  @IsOptional()
  @IsString()
  @Matches(ISO_DATETIME_RE)
  canceledAt?: string;
}

export class ElectionLedgerDto {
  @IsString()
  @IsNotEmpty()
  electionId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(ISO_DATETIME_RE)
  startDate!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(ISO_DATETIME_RE)
  endDate!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(ELECTION_STATUS_VALUES)
  status!: ElectionStatusType;

  @IsString()
  @IsNotEmpty()
  signingPublicKey!: string;

  @IsString()
  @IsNotEmpty()
  createdBy!: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  updatedBy!: string;

  @ValidateNested()
  @Type(() => ElectionTimelineDto)
  timeline!: ElectionTimelineDto;
}
