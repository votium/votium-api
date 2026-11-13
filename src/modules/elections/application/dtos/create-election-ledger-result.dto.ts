import { Transform, Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  IsIn,
  IsNumber,
  IsOptional,
  ValidateNested,
} from 'class-validator';
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

export class ElectionDataDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/)
  electionId!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsString()
  @Matches(ISO_DATETIME_RE)
  startDate!: string;

  @IsString()
  @Matches(ISO_DATETIME_RE)
  endDate!: string;

  @IsIn(ELECTION_STATUS_VALUES)
  status!: ElectionStatusType;

  @IsString()
  @IsNotEmpty()
  signingPublicKey!: string;

  @IsString()
  @IsNotEmpty()
  createdBy!: string;

  @IsOptional()
  @IsString()
  updatedBy?: string;

  @ValidateNested()
  @Type(() => ElectionTimelineDto)
  timeline!: ElectionTimelineDto;
}

export class CreateElectionLedgerResultDto {
  @IsString()
  @IsNotEmpty()
  txId?: string;

  @IsNumber()
  @IsNotEmpty()
  blockNumber?: number | null;

  @ValidateNested()
  @Type(() => ElectionDataDto)
  data!: ElectionDataDto;
}
