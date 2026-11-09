import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { IsRsaPublicKey } from './is-rsa-public-key';

export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const HASH_RE = /^[0-9a-f]{64}$/;
const TZ_RE = /(Z|[+-]\d{2}:\d{2})$/;
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
const NOT_BLANK = /\S/;

export class ElectionIdDto {
  @IsString() @Matches(ID_RE) electionId!: string;
}

export class CreateElectionDto extends ElectionIdDto {
  @IsString() @MinLength(1) @MaxLength(200) @Matches(NOT_BLANK) name!: string;
  @IsString()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(TZ_RE)
  startDate!: string;
  @IsString() @IsISO8601({ strict: true, strictSeparator: true }) @Matches(TZ_RE) endDate!: string;
  @IsRsaPublicKey() signingPublicKey!: string;
}

export class CandidateKeyDto extends ElectionIdDto {
  @IsString() @Matches(ID_RE) candidateId!: string;
}

export class RegisterCandidateDto extends CandidateKeyDto {
  @IsString() @MinLength(1) @MaxLength(200) @Matches(NOT_BLANK) name!: string; // 200 is a client-side cap, not in the contract
}

export class VoterKeyDto extends ElectionIdDto {
  @IsString() @Matches(HASH_RE) voterHash!: string;
}

export class VoterBatchDto extends ElectionIdDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @Matches(HASH_RE, { each: true })
  voterHashes!: string[];
}

export class CastVoteDto extends CandidateKeyDto {
  @IsString() @Matches(HASH_RE) nullifier!: string;
  @IsString() @MinLength(1) @MaxLength(2048) @Matches(BASE64_RE) signature!: string;
}

export class VotesQueryDto extends ElectionIdDto {
  @IsOptional() @IsInt() @Min(1) @Max(1000) pageSize?: number;
  @IsOptional() @IsString() @MaxLength(2048) bookmark?: string;
}
