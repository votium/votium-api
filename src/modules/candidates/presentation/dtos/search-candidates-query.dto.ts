import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class SearchCandidatesQueryDto {
  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({ example: 10, required: false })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit: number = 10;

  @ApiProperty({ example: 'Juan', required: false })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiProperty({ example: 'Garcia', required: false })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiProperty({
    example: 'Juan',
    required: false,
    description: 'Partial, case-insensitive match on first or last name.',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: '1234', required: false, description: 'Exactly four digits.' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/, { message: 'Program code must contain exactly four digits.' })
  studyPlanCode?: string;

  @ApiProperty({ example: 'CAND-1234', required: false })
  @IsOptional()
  @IsString()
  studentCode?: string;

  @ApiProperty({ example: 'ID-12345678', required: false })
  @IsOptional()
  @IsString()
  identificationNumber?: string;

  @ApiProperty({
    example: true,
    required: false,
    description:
      'Include logically deleted (INACTIVE) candidates. Defaults to false (INACTIVE excluded).',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  includeInactive?: boolean;
}
