import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

function trimValue(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateCandidateDto {
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @Matches(/^\d{4}$/, { message: 'Program code must contain exactly four digits.' })
  programCode?: string;

  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @IsNotEmpty()
  identificationNumber?: string;
}
