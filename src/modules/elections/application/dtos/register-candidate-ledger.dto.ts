import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

function trimValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.trim();
  }
  return value;
}

export class RegisterCandidateLedgerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/)
  electionId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/)
  candidateId!: string;

  @Transform(({ value }) => trimValue(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;
}
