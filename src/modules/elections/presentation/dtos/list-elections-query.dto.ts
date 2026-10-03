import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import { ELECTION_STATUSES, type ElectionStatus } from '../../domain/entities/election.entity';

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

export class ListElectionsQueryDto {
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

  @ApiProperty({
    example: 'Student Council',
    required: false,
    description: 'Partial, case-insensitive name match.',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({
    example: 'CREATED',
    required: false,
    enum: ELECTION_STATUSES,
    description: 'Lifecycle status filter.',
  })
  @IsOptional()
  @IsIn(ELECTION_STATUSES)
  status?: ElectionStatus;

  @ApiProperty({
    example: '2026-08-29',
    required: false,
    description: 'Start date in YYYY-MM-DD format. Elections with start_date >= this date.',
  })
  @IsOptional()
  @IsString()
  @Matches(DATE_FORMAT, {
    message: 'startDate must be a valid calendar date in YYYY-MM-DD format.',
  })
  startDate?: string;

  @ApiProperty({
    example: '2026-12-31',
    required: false,
    description: 'End date in YYYY-MM-DD format. Elections with end_date <= this date.',
  })
  @IsOptional()
  @IsString()
  @Matches(DATE_FORMAT, {
    message: 'endDate must be a valid calendar date in YYYY-MM-DD format.',
  })
  endDate?: string;

  @ApiProperty({
    example: true,
    required: false,
    description:
      'Schedule-active filter (now between start and end instants). Defaults to true when neither status nor active is provided.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  active?: boolean;
}
