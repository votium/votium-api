import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsString,
  ValidateNested,
  IsOptional,
} from 'class-validator';

export class CastVoteDatatDto {
  @IsString()
  @IsNotEmpty()
  electionId!: string;

  @IsString()
  @IsNotEmpty()
  nullifier!: string;

  @IsNotEmpty()
  @IsBoolean()
  accepted!: true;
}

export class CastVoteResultDto {
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
  @Type(() => CastVoteDatatDto)
  data!: CastVoteDatatDto;
}
