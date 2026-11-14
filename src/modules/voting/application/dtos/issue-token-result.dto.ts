import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  IsBoolean,
} from 'class-validator';

export class IssueTokenDataDto {
  @IsString()
  @IsNotEmpty()
  tokenExpiresAt!: string;

  @IsNumber()
  @IsNotEmpty()
  issuedCount!: number;
}

export class IssueTokenResultDto {
  @IsString()
  @IsNotEmpty()
  txId!: string;

  @IsInt()
  @IsNotEmpty()
  blockNumber!: number | null;

  @IsBoolean()
  @IsOptional()
  recovered?: boolean;

  @ValidateNested()
  @Type(() => IssueTokenDataDto)
  data!: IssueTokenDataDto;
}
