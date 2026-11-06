import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import { CANDIDATE_STATUSES, type CandidateStatus } from '../../domain/entities/candidate.entity';

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

  @ApiProperty({
    example: '12',
    maxLength: 4,
    required: false,
    pattern: '^\\d{1,4}$',
    description: 'Program code. Contains between 1 and 4 digits; partial match.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,4}$/, { message: 'Program code must contain between 1 and 4 digits.' })
  programCode?: string;

  @ApiProperty({
    example: '202012345',
    maxLength: 9,
    required: false,
    pattern: '^\\d{1,9}$',
    description: 'Student code. Contains between 1 and 9 digits; partial match.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,9}$/, { message: 'Student code must contain between 1 and 9 digits.' })
  studentCode?: string;

  @ApiProperty({ example: 'ID-12345678', required: false })
  @IsOptional()
  @IsString()
  identificationNumber?: string;

  @ApiProperty({
    example: 'ACTIVE',
    required: false,
    enum: CANDIDATE_STATUSES,
    description:
      'Filter by candidate status. When omitted, candidates of every status are returned.',
  })
  @IsOptional()
  @IsIn(CANDIDATE_STATUSES)
  status?: CandidateStatus;
}
