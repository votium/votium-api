import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

function trimValue(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateCandidateDto {
  @ApiProperty({ example: 'Juan', required: false })
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  firstName?: string;

  @ApiProperty({ example: 'Garcia', required: false })
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  lastName?: string;

  @ApiProperty({ example: '1234', required: false, description: 'Exactly four digits.' })
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @Matches(/^\d{4}$/, { message: 'Program code must contain exactly four digits.' })
  programCode?: string;

  @ApiProperty({ example: 'ID-12345678', required: false })
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @IsNotEmpty()
  identificationNumber?: string;

  @ApiProperty({ example: 'Maria', required: false })
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  companionFirstName?: string;

  @ApiProperty({ example: 'Lopez', required: false })
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  companionLastName?: string;

  @ApiProperty({ example: '20209999', required: false })
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @IsNotEmpty()
  companionStudentCode?: string;

  @ApiProperty({ example: '9999', required: false, description: 'Exactly four digits.' })
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d{4}$/, { message: 'Companion program code must contain exactly four digits.' })
  companionProgramCode?: string;

  @ApiProperty({ example: '2000000000', required: false })
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @IsNotEmpty()
  companionIdentification?: string;
}
