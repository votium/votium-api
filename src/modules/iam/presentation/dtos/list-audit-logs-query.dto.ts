import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Matches, Min } from 'class-validator';

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

export class ListAuditLogsQueryDto {
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
    example: 'uuid',
    required: false,
    format: 'uuid',
    description: 'Filter by the user that produced the event.',
  })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiProperty({
    example: '2026-11-01',
    required: false,
    description: 'Inclusive lower bound on timestamp (YYYY-MM-DD).',
  })
  @IsOptional()
  @IsString()
  @Matches(DATE_FORMAT, {
    message: 'startDate must be a valid calendar date in YYYY-MM-DD format.',
  })
  startDate?: string;

  @ApiProperty({
    example: '2026-11-30',
    required: false,
    description: 'Inclusive upper bound on timestamp (YYYY-MM-DD).',
  })
  @IsOptional()
  @IsString()
  @Matches(DATE_FORMAT, {
    message: 'endDate must be a valid calendar date in YYYY-MM-DD format.',
  })
  endDate?: string;
}
