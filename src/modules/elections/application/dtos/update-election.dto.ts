import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

function trimValue(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const TIME_FORMAT = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export class UpdateElectionDto {
  @ApiProperty({ example: 'Student Council Election', required: false })
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiProperty({ example: 'Annual election for the student council.', required: false })
  @IsOptional()
  @Transform(({ value }) => trimValue(value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  description?: string;

  @ApiProperty({
    example: '2026-08-29',
    required: false,
    description: 'Start date in YYYY-MM-DD format.',
  })
  @IsOptional()
  @IsString()
  @Matches(DATE_FORMAT, {
    message: 'startDate must be a valid calendar date in YYYY-MM-DD format.',
  })
  startDate?: string;

  @ApiProperty({
    example: '15:00:00',
    required: false,
    description: 'Start time in HH:mm[:ss] format.',
  })
  @IsOptional()
  @IsString()
  @Matches(TIME_FORMAT, {
    message: 'startTime must be a valid time in HH:mm[:ss] format.',
  })
  startTime?: string;

  @ApiProperty({
    example: '2026-08-30',
    required: false,
    description: 'End date in YYYY-MM-DD format.',
  })
  @IsOptional()
  @IsString()
  @Matches(DATE_FORMAT, {
    message: 'endDate must be a valid calendar date in YYYY-MM-DD format.',
  })
  endDate?: string;

  @ApiProperty({
    example: '15:00:00',
    required: false,
    description: 'End time in HH:mm[:ss] format.',
  })
  @IsOptional()
  @IsString()
  @Matches(TIME_FORMAT, {
    message: 'endTime must be a valid time in HH:mm[:ss] format.',
  })
  endTime?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  blankVoteEnabled?: boolean;
}
