import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

function trimValue(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateCandidateDto {
  @ApiProperty({ example: 'Juan' })
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: 'Garcia' })
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ example: 'CAND-1234' })
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @IsNotEmpty()
  studentCode!: string;

  @ApiProperty({ example: '1234', description: 'Exactly four digits.' })
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}$/, { message: 'Program code must contain exactly four digits.' })
  programCode!: string;

  @ApiProperty({ example: 'ID-12345678' })
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @IsNotEmpty()
  identificationNumber!: string;
}
