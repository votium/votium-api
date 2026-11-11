import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import {
  ELECTION_STATUSES,
  type ElectionStatus,
} from 'src/modules/elections/domain/entities/election.entity';

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

export class ListElectorElectionsQueryDto {
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
    example: 'ELECTION-102026',
    required: false,
    description: 'Partial, case-insensitive election code match.',
  })
  @IsOptional()
  @IsString()
  electionCode?: string;

  @ApiProperty({
    example: 'ACTIVE',
    required: false,
    enum: ELECTION_STATUSES,
    description: 'Lifecycle status filter. Optional; when omitted, no status filter is applied.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
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
    message: 'startDateFrom must be a valid calendar date in YYYY-MM-DD format.',
  })
  startDateFrom?: string;

  @ApiProperty({
    example: '2026-12-31',
    required: false,
    description: 'Start date in YYYY-MM-DD format. Elections with start_date <= this date.',
  })
  @IsOptional()
  @IsString()
  @Matches(DATE_FORMAT, {
    message: 'startDateTo must be a valid calendar date in YYYY-MM-DD format.',
  })
  startDateTo?: string;
}
