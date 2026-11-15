import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  Matches,
} from 'class-validator';

export const HASH_RE = /^[0-9a-f]{64}$/;

export class RegisterElectoralRollLedgerDto {
  @IsString()
  @IsNotEmpty()
  electionId!: string;

  @IsArray()
  @IsNotEmpty()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @Matches(HASH_RE, { each: true })
  voterHashes!: string[];
}
