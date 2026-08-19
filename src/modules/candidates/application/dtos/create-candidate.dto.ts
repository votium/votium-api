import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

function trimValue(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateCandidateDto {
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstName!: string;

  @Transform(({ value }) => trimValue(value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastName!: string;

  @Transform(({ value }) => trimValue(value))
  @IsString()
  @IsNotEmpty()
  studentCode!: string;

  @Transform(({ value }) => trimValue(value))
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}$/, { message: 'Program code must contain exactly four digits.' })
  programCode!: string;

  @Transform(({ value }) => trimValue(value))
  @IsString()
  @IsNotEmpty()
  identificationNumber!: string;
}
