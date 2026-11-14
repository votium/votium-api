import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export type VoterStatus = 'ELIGIBLE' | 'ISSUED' | 'VOTED' | 'NOT_FOUND';

export class VoterStatusDto {
  @IsString()
  @IsNotEmpty()
  electionId!: string;

  @IsString()
  @IsNotEmpty()
  voterHash!: string;

  @IsString()
  @IsNotEmpty()
  status!: VoterStatus;

  @IsBoolean()
  @IsNotEmpty()
  tokenActive!: boolean;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  tokenExpiresAt?: string;

  @IsBoolean()
  @IsNotEmpty()
  canIssueToken!: boolean;
}
