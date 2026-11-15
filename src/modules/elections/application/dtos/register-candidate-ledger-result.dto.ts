import { Type } from 'class-transformer';
import { IsString, IsNotEmpty, IsNumber, ValidateNested } from 'class-validator';

export class CandidateDataDto {
  @IsString()
  @IsNotEmpty()
  electionId!: string;

  @IsString()
  @IsNotEmpty()
  candidateId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  registeredBy!: string;

  @IsString()
  @IsNotEmpty()
  registeredAt!: string;
}

export class RegisterCandidateLedgerResultDto {
  @IsString()
  @IsNotEmpty()
  txId?: string;

  @IsNumber()
  @IsNotEmpty()
  blockNumber?: number | null;

  @ValidateNested()
  @Type(() => CandidateDataDto)
  data!: CandidateDataDto;
}
