import { Type } from 'class-transformer';
import { ValidateNested, IsString, IsInt, IsNotEmpty, IsIn, IsOptional } from 'class-validator';

export type ReasonType = 'NOT_IN_ROLL' | 'NO_TOKEN_ISSUED';

export class VoterRejectionDto {
  @IsString()
  @IsNotEmpty()
  voterHash!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(['NOT_IN_ROLL', 'NO_TOKEN_ISSUED'])
  reason!: ReasonType;
}

export class MarkVotedBatchDataDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  electionId?: string;

  @IsInt()
  @IsNotEmpty()
  marked!: number;

  @IsInt()
  @IsNotEmpty()
  alreadyVoted!: number;

  @ValidateNested()
  @Type(() => VoterRejectionDto)
  rejected!: VoterRejectionDto[];
}

export class MarkVotedBatchResultDto {
  @IsString()
  @IsNotEmpty()
  txId?: string;

  @IsInt()
  @IsNotEmpty()
  blockNumber?: number | null;

  @ValidateNested()
  @Type(() => MarkVotedBatchDataDto)
  data!: MarkVotedBatchDataDto;
}
